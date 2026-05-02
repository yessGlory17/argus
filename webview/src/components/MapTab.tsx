import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Step } from '../types/session';
import './MapTab.css';

export interface DirEntry {
  name: string;
  type: 'file' | 'dir';
}

interface Props {
  steps: Step[];
  cwd: string;
  topLevelEntries: DirEntry[];
  onGoToStep?: (stepIndex: number) => void;
}

type NodeStatus = 'dim' | 'read' | 'written';
type NodeKind = 'file' | 'dir' | 'root';

interface TreeNode {
  name: string;
  path: string;
  type: NodeKind;
  status: NodeStatus;
  revealedAt: number;
  readCount: number;
  writeCount: number;
  agentTouched: boolean;
  children?: TreeNode[];
}

interface StepEvent {
  path: string;
  kind: 'read' | 'write';
  stepIndex: number;
  agentId?: string;
}

const NODE_W = 210;
const NODE_H = 36;
const DX = NODE_H + 14;
const DY = NODE_W + 36;

const truncate = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// Outline icons normalized to a 24×24 viewBox with their visual center
// near (12, 12) so different glyphs land in the same spot inside the card.
const ICON_FOLDER = 'M3 7 H9 L11 9 H21 V19 H3 Z';
const ICON_FILE = 'M6 3 H15 L19 7 V21 H6 Z M15 3 V7 H19';
const ICON_HOME = 'M3 12 L12 4 L21 12 V20 H3 Z M10 20 V14 H14 V20';

const iconFor = (type: NodeKind) => {
  if (type === 'root') return ICON_HOME;
  if (type === 'dir') return ICON_FOLDER;
  return ICON_FILE;
};

// Read/write count → visual intensity bucket.
const intensityBucket = (count: number): 0 | 1 | 2 | 3 => {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
};

const MapTab = ({ steps, cwd, topLevelEntries, onGoToStep }: Props) => {
  const onGoToStepRef = useRef(onGoToStep);
  useEffect(() => {
    onGoToStepRef.current = onGoToStep;
  }, [onGoToStep]);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const userInteractedRef = useRef(false);
  const knownPathsRef = useRef<Set<string>>(new Set());

  const [currentStep, setCurrentStep] = useState<number>(steps.length);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(350);

  // Reset cursor when steps change (new session loaded)
  useEffect(() => {
    setCurrentStep(steps.length);
    knownPathsRef.current = new Set();
  }, [steps.length]);

  // Extract file events relative to cwd
  const stepEvents = useMemo<StepEvent[]>(() => {
    if (!cwd) return [];
    const cwdNorm = cwd.replace(/\/+$/, '');
    const out: StepEvent[] = [];
    for (const step of steps) {
      const fp: string | undefined = step.toolInput?.file_path;
      if (!fp || typeof fp !== 'string') continue;
      let rel: string | null = null;
      if (fp === cwdNorm) continue;
      if (fp.startsWith(cwdNorm + '/')) {
        rel = fp.slice(cwdNorm.length + 1);
      } else if (!fp.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(fp)) {
        rel = fp;
      } else {
        continue;
      }
      rel = rel.replace(/\\/g, '/').replace(/^\.\/+/, '');
      if (!rel) continue;
      const tn = step.toolName;
      const stepIndex = step.globalIndex ?? step.index;
      if (tn === 'Read') {
        out.push({ path: rel, kind: 'read', stepIndex, agentId: step.agentId });
      } else if (tn === 'Write' || tn === 'Edit' || tn === 'MultiEdit') {
        out.push({ path: rel, kind: 'write', stepIndex, agentId: step.agentId });
      }
    }
    return out;
  }, [steps, cwd]);

  // Build the tree up to the current step
  const { root, lastRevealedPath, lastAppliedStep } = useMemo(() => {
    const rootName = cwd ? cwd.split('/').filter(Boolean).pop() || cwd : 'project';
    const rootNode: TreeNode = {
      name: rootName,
      path: '',
      type: 'root',
      status: 'dim',
      revealedAt: -1,
      readCount: 0,
      writeCount: 0,
      agentTouched: false,
      children: [],
    };
    const map = new Map<string, TreeNode>();
    map.set('', rootNode);

    // Top-level shows only directories by default; top-level files appear
    // lazily when Claude reads/writes them (via stepEvents below).
    for (const entry of topLevelEntries) {
      if (entry.type !== 'dir') continue;
      const n: TreeNode = {
        name: entry.name,
        path: entry.name,
        type: 'dir',
        status: 'dim',
        revealedAt: -1,
        readCount: 0,
        writeCount: 0,
        agentTouched: false,
        children: [],
      };
      rootNode.children!.push(n);
      map.set(entry.name, n);
    }

    let lastPath = '';
    let lastStep = -1;
    for (const ev of stepEvents) {
      if (ev.stepIndex >= currentStep) break;
      const segments = ev.path.split('/').filter(Boolean);
      let acc = '';
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const parentPath = acc;
        acc = acc ? `${acc}/${seg}` : seg;
        const isLast = i === segments.length - 1;
        let node = map.get(acc);
        if (!node) {
          const parent = map.get(parentPath);
          if (!parent) break;
          if (!parent.children) parent.children = [];
          node = {
            name: seg,
            path: acc,
            type: isLast ? 'file' : 'dir',
            status: 'dim',
            revealedAt: ev.stepIndex,
            readCount: 0,
            writeCount: 0,
            agentTouched: false,
            children: isLast ? undefined : [],
          };
          parent.children.push(node);
          map.set(acc, node);
        }
        if (isLast) {
          if (ev.kind === 'read') {
            node.readCount += 1;
            if (node.status !== 'written') node.status = 'read';
          } else {
            node.writeCount += 1;
            node.status = 'written';
          }
          if (node.revealedAt < 0) node.revealedAt = ev.stepIndex;
          if (ev.agentId) node.agentTouched = true;
          lastPath = acc;
        }
      }
      lastStep = ev.stepIndex;
    }

    return { root: rootNode, lastRevealedPath: lastPath, lastAppliedStep: lastStep };
  }, [stepEvents, topLevelEntries, currentStep, cwd]);

  // Stats
  const stats = useMemo(() => {
    let revealed = 0;
    let read = 0;
    let written = 0;
    const walk = (n: TreeNode) => {
      revealed += 1;
      if (n.status === 'read') read += 1;
      else if (n.status === 'written') written += 1;
      n.children?.forEach(walk);
    };
    walk(root);
    return { revealed: revealed - 1, read, written };
  }, [root]);

  // Render
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);

    // Preserve the user's current zoom scale across re-renders so that
    // panning to a newly revealed node does not snap them back to 1×.
    const prevTransform = d3.zoomTransform(svgRef.current);
    const preservedScale = userInteractedRef.current ? prevTransform.k : 1;

    svg.selectAll('*').remove();

    const width = containerRef.current.clientWidth || 1000;
    const height = containerRef.current.clientHeight || 600;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const root3 = d3.hierarchy<TreeNode>(root, (d) => d.children);
    const tree = d3.tree<TreeNode>().nodeSize([DX, DY]);
    tree(root3);

    // Detect which paths are genuinely new since the previous render —
    // re-reads of an already-revealed file must not retrigger the bounce.
    const currentPaths = new Set<string>();
    root3.each((d) => currentPaths.add(d.data.path));
    const justAddedCount = [...currentPaths].filter(
      (p) => !knownPathsRef.current.has(p)
    ).length;
    // Slider jumps reveal many paths at once — skip the bounce in that case
    // so the screen doesn't explode.
    const animateFresh = justAddedCount > 0 && justAddedCount <= 3;
    const freshPaths = new Set<string>();
    if (animateFresh) {
      for (const p of currentPaths) {
        if (!knownPathsRef.current.has(p)) freshPaths.add(p);
      }
    }
    knownPathsRef.current = currentPaths;

    const g = svg.append('g').attr('class', 'map-canvas');

    // Zoom behavior — free pan/zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 2.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      })
      .on('start', (event) => {
        if (event.sourceEvent) userInteractedRef.current = true;
      });
    svg.call(zoom as any);
    zoomRef.current = zoom;

    // Links — orthogonal-ish curves
    const linkGen = d3
      .linkHorizontal<d3.HierarchyLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
      .x((d: any) => d.y)
      .y((d: any) => d.x);

    const linkSel = g.append('g')
      .attr('class', 'map-links')
      .selectAll<SVGPathElement, d3.HierarchyPointLink<TreeNode>>('path')
      .data(root3.links())
      .join('path')
      .attr('d', linkGen as any)
      .attr('class', (d: any) => {
        const t = d.target.data as TreeNode;
        const isFresh = freshPaths.has(t.path);
        return [
          'map-link',
          `map-link-${t.status}`,
          isFresh ? 'map-link-fresh' : '',
        ]
          .filter(Boolean)
          .join(' ');
      });

    // For freshly drawn links, set dasharray = pathLength so the draw-in
    // animation completes at the destination instead of cutting off mid-curve
    // or trailing past it.
    linkSel.each(function (d: any) {
      if (!freshPaths.has(d.target.data.path)) return;
      const len = (this as SVGPathElement).getTotalLength();
      d3.select(this)
        .attr('stroke-dasharray', `${len} ${len}`)
        .attr('stroke-dashoffset', len)
        .style('--map-link-len', `${len}px`);
    });

    // Nodes
    const nodes = g
      .append('g')
      .attr('class', 'map-nodes')
      .selectAll('g.map-node')
      .data(root3.descendants())
      .join('g')
      .attr('class', (d) => {
        const data = d.data;
        const isFresh = freshPaths.has(data.path);
        const count =
          data.status === 'written'
            ? data.writeCount
            : data.status === 'read'
            ? data.readCount
            : 0;
        const intensity = intensityBucket(count);
        const clickable = data.status !== 'dim' && data.revealedAt >= 0;
        return [
          'map-node',
          `map-node-${data.type}`,
          `map-node-${data.status}`,
          intensity ? `map-node-intensity-${intensity}` : '',
          isFresh ? 'map-node-fresh' : '',
          clickable ? 'map-node-clickable' : '',
          data.agentTouched ? 'map-node-agent' : '',
        ]
          .filter(Boolean)
          .join(' ');
      })
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`)
      .on('click', (event, d) => {
        const data = d.data;
        if (data.status === 'dim' || data.revealedAt < 0) return;
        event.stopPropagation();
        onGoToStepRef.current?.(data.revealedAt);
      });

    nodes
      .append('rect')
      .attr('class', 'map-node-rect')
      .attr('x', -NODE_W / 2)
      .attr('y', -NODE_H / 2)
      .attr('width', NODE_W)
      .attr('height', NODE_H)
      .attr('rx', 7)
      .attr('ry', 7);

    // Icons — render each glyph inside its own nested 24×24 SVG so every
    // type lands in the same 16×16 box regardless of the path's bbox.
    const ICON_SIZE = 16;
    const ICON_X = -NODE_W / 2 + 10;
    const ICON_Y = -ICON_SIZE / 2;
    const iconWrap = nodes
      .append('svg')
      .attr('class', 'map-node-iconwrap')
      .attr('x', ICON_X)
      .attr('y', ICON_Y)
      .attr('width', ICON_SIZE)
      .attr('height', ICON_SIZE)
      .attr('viewBox', '0 0 24 24')
      .attr('overflow', 'visible');

    iconWrap
      .append('path')
      .attr('class', 'map-node-iconpath')
      .attr('d', (d: any) => iconFor((d as any).data.type))
      .attr('fill', 'none')
      .attr('stroke-width', 1.8)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('vector-effect', 'non-scaling-stroke');

    nodes
      .append('text')
      .attr('class', 'map-node-label')
      .attr('x', -NODE_W / 2 + 34)
      .attr('y', 4)
      .text((d) => {
        const hasBadge =
          d.data.readCount > 1 ||
          d.data.writeCount > 0 ||
          (d.data.readCount > 0 && d.data.writeCount > 0);
        return truncate(d.data.name, hasBadge ? 22 : 28);
      });

    nodes
      .append('text')
      .attr('class', 'map-node-badge')
      .attr('x', NODE_W / 2 - 10)
      .attr('y', 4)
      .attr('text-anchor', 'end')
      .text((d) => {
        const r = d.data.readCount;
        const w = d.data.writeCount;
        if (w > 0 && r > 0) return `${r}r·${w}w`;
        if (w > 0) return `${w}w`;
        if (r > 0) return r > 1 ? `${r}r` : '';
        return '';
      });

    nodes.append('title').text((d) => {
      const data = d.data;
      const lines = [data.path || data.name];
      if (data.readCount) lines.push(`Reads: ${data.readCount}`);
      if (data.writeCount) lines.push(`Writes: ${data.writeCount}`);
      if (data.agentTouched) lines.push('Touched by sub-agent');
      if (data.revealedAt >= 0) {
        lines.push(`Click → step #${data.revealedAt}`);
      }
      return lines.join('\n');
    });

    // Sub-agent touched nodes get two affordances:
    //   1. A thin coloured ribbon inset at the rect's left edge — visible
    //      regardless of read/write intensity since it sits on top of the
    //      filled background.
    //   2. A compact rounded "agent" pill at the upper-right corner so the
    //      label is unambiguous even at distance.
    const agentNodes = nodes.filter((d) => d.data.agentTouched);

    agentNodes
      .append('rect')
      .attr('class', 'map-node-agent-ribbon')
      .attr('x', -NODE_W / 2 + 2)
      .attr('y', -NODE_H / 2 + 4)
      .attr('width', 3)
      .attr('height', NODE_H - 8)
      .attr('rx', 1.5)
      .attr('ry', 1.5);

    const agentPill = agentNodes
      .append('g')
      .attr('class', 'map-node-agent-pill')
      .attr('transform', `translate(${NODE_W / 2 - 26},${-NODE_H / 2 - 7})`);

    agentPill
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 30)
      .attr('height', 14)
      .attr('rx', 7)
      .attr('ry', 7);

    agentPill
      .append('text')
      .attr('x', 15)
      .attr('y', 10)
      .attr('text-anchor', 'middle')
      .text('agent');

    // Camera: auto-pan to last revealed node, otherwise fit
    const lastNode = root3.descendants().find((d) => d.data.path === lastRevealedPath);

    const applyTransform = (t: d3.ZoomTransform, animate: boolean) => {
      const sel = animate ? svg.transition().duration(550).ease(d3.easeCubicOut) : svg;
      (sel as any).call(zoom.transform, t);
    };

    if (lastNode && lastRevealedPath) {
      const k = preservedScale;
      const tx = width / 2 - (lastNode as any).y * k;
      const ty = height / 2 - (lastNode as any).x * k;
      applyTransform(d3.zoomIdentity.translate(tx, ty).scale(k), userInteractedRef.current);
    } else if (userInteractedRef.current) {
      // No new touch — keep the user's view exactly as they left it.
      applyTransform(prevTransform, false);
    } else {
      // Initial fit: place root near left, vertical center
      let x0 = Infinity;
      let x1 = -Infinity;
      root3.each((d: any) => {
        if (d.x < x0) x0 = d.x;
        if (d.x > x1) x1 = d.x;
      });
      const treeH = Math.max(x1 - x0, 1);
      const k = Math.min(1, (height - 80) / treeH);
      const tx = 100;
      const ty = height / 2 - ((x0 + x1) / 2) * k;
      applyTransform(d3.zoomIdentity.translate(tx, ty).scale(k), false);
    }
  }, [root, lastRevealedPath, lastAppliedStep]);

  // Autoplay
  useEffect(() => {
    if (!playing) return;
    if (currentStep >= steps.length) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      setCurrentStep((c) => Math.min(c + 1, steps.length));
    }, speedMs);
    return () => window.clearTimeout(id);
  }, [playing, currentStep, steps.length, speedMs]);

  const resetView = () => {
    if (!svgRef.current || !zoomRef.current) return;
    userInteractedRef.current = false;
    setCurrentStep(currentStep); // trigger re-fit via render effect
    // Manually trigger fit by clearing transform
    d3.select(svgRef.current)
      .transition()
      .duration(400)
      .call(zoomRef.current.transform as any, d3.zoomIdentity);
  };

  if (!cwd) {
    return (
      <div className="map-empty">
        <span className="map-empty-icon">🗺️</span>
        <p>No working directory available for this session</p>
      </div>
    );
  }

  return (
    <div className="map-tab">
      <div className="map-controls">
        <div className="map-controls-left">
          <button
            className="map-btn map-btn-primary"
            onClick={() => {
              if (currentStep >= steps.length) setCurrentStep(0);
              setPlaying((p) => !p);
            }}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            className="map-btn"
            onClick={() => {
              setPlaying(false);
              setCurrentStep(0);
            }}
            title="Reset to start"
          >
            ⏮
          </button>
          <button
            className="map-btn"
            onClick={() => {
              setPlaying(false);
              setCurrentStep(steps.length);
            }}
            title="Jump to end"
          >
            ⏭
          </button>
        </div>

        <input
          className="map-slider"
          type="range"
          min={0}
          max={steps.length}
          value={currentStep}
          onChange={(e) => {
            setPlaying(false);
            setCurrentStep(Number(e.target.value));
          }}
        />

        <div className="map-controls-right">
          <span className="map-step-counter">
            {currentStep} / {steps.length}
          </span>
          <select
            className="map-speed"
            value={speedMs}
            onChange={(e) => setSpeedMs(Number(e.target.value))}
            title="Playback speed"
          >
            <option value={800}>0.5×</option>
            <option value={350}>1×</option>
            <option value={150}>2×</option>
            <option value={60}>4×</option>
          </select>
          <button className="map-btn" onClick={resetView} title="Reset view">
            ⊕
          </button>
        </div>
      </div>

      <div className="map-canvas-wrap" ref={containerRef}>
        <svg ref={svgRef} className="map-svg" />
        <div className="map-legend">
          <span className="map-legend-item">
            <span className="map-legend-dot dim" /> not visited
          </span>
          <span className="map-legend-item">
            <span className="map-legend-dot read" /> read
          </span>
          <span className="map-legend-item">
            <span className="map-legend-dot written" /> written
          </span>
          <span className="map-legend-item">
            <span className="map-legend-dot agent" /> sub-agent
          </span>
        </div>
      </div>

      <div className="map-stats">
        <div className="map-stat">
          <span className="map-stat-label">Nodes</span>
          <span className="map-stat-value">{stats.revealed}</span>
        </div>
        <div className="map-stat">
          <span className="map-stat-label">Read</span>
          <span className="map-stat-value map-stat-read">{stats.read}</span>
        </div>
        <div className="map-stat">
          <span className="map-stat-label">Written</span>
          <span className="map-stat-value map-stat-written">{stats.written}</span>
        </div>
        <div className="map-stat map-stat-cwd" title={cwd}>
          <span className="map-stat-label">cwd</span>
          <span className="map-stat-value">{truncate(cwd.split('/').slice(-2).join('/'), 32)}</span>
        </div>
      </div>
    </div>
  );
};

export default MapTab;
