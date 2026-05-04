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

const NODE_W = 340;
const NODE_H = 56;
const DX = NODE_H + 18;
const DY = NODE_W + 56;

// Layout tokens — every position is derived from these so the card stays
// internally aligned regardless of which decorations are present.
const NODE_RADIUS = 9;
const STATUS_STRIPE_W = 4;
const STATUS_STRIPE_INSET = 8; // top/bottom inset
const ICON_TILE = 30;
const ICON_TILE_RADIUS = 7;
const ICON_TILE_X = -NODE_W / 2 + 14; // left padding 14px
const ICON_GLYPH = 16;
const LABEL_X = ICON_TILE_X + ICON_TILE + 12; // 12px gap to label
const LABEL_FONT = 13;
const RIGHT_PAD = 12;
const CHIP_H = 22;
const CHIP_GAP = 6;
const CHIP_PAD_X = 9;
const CHIP_MID_GAP = 6;
const CHIP_LETTER_W = 7; // mono "R"/"W" at 10.5px
const CHIP_DIGIT_W = 7;
const AGENT_PILL_W = 60;
const AGENT_PILL_H = 22;
const LABEL_CHAR_W = 7.2; // mono char width at 13px

// Middle ellipsis — keeps the start (often distinctive) and the file extension
// visible. "SessionWebviewProvider.tsx" → "SessionWebvi…ider.tsx"
const truncateMiddle = (s: string, n: number) => {
  if (n <= 3) return s.slice(0, n);
  if (s.length <= n) return s;
  const keep = n - 1;
  const left = Math.ceil(keep * 0.62);
  const right = keep - left;
  return s.slice(0, left) + '…' + s.slice(s.length - right);
};

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
  const isDraggingRef = useRef(false);
  const pendingRenderRef = useRef(false);
  const knownPathsRef = useRef<Set<string>>(new Set());
  const prevLastRevealedRef = useRef<string>('');
  const freshPathsRef = useRef<Set<string>>(new Set());

  const [currentStep, setCurrentStep] = useState<number>(steps.length);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(350);
  const [renderTick, setRenderTick] = useState(0);

  // Reset cursor when steps change (new session loaded)
  useEffect(() => {
    setCurrentStep(steps.length);
    knownPathsRef.current = new Set();
  }, [steps.length]);

  // Track recent drag to avoid animation during drag settle time
  const recentlyDraggedRef = useRef(false);
  const dragSettleTimeoutRef = useRef<number | null>(null);

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

  // Activity ranges for the timeline overlay — collapse contiguous step
  // indices that share the same activity kind into a single span so the
  // slider track shows clear blue/green zones instead of hundreds of
  // 1-pixel ticks. Write takes precedence over read at the same step.
  const activityRanges = useMemo(() => {
    const max = Math.max(steps.length, 1);
    if (stepEvents.length === 0) return { ranges: [] as { start: number; end: number; kind: 'read' | 'write' }[], max };
    const slots = new Array<'read' | 'write' | null>(max).fill(null);
    for (const ev of stepEvents) {
      if (ev.stepIndex < 0 || ev.stepIndex >= max) continue;
      if (ev.kind === 'write') slots[ev.stepIndex] = 'write';
      else if (slots[ev.stepIndex] !== 'write') slots[ev.stepIndex] = 'read';
    }
    const ranges: { start: number; end: number; kind: 'read' | 'write' }[] = [];
    let cur: { start: number; end: number; kind: 'read' | 'write' } | null = null;
    for (let i = 0; i < max; i++) {
      const k = slots[i];
      if (k) {
        if (cur && cur.kind === k && cur.end === i - 1) cur.end = i;
        else {
          if (cur) ranges.push(cur);
          cur = { start: i, end: i, kind: k };
        }
      } else if (cur) {
        ranges.push(cur);
        cur = null;
      }
    }
    if (cur) ranges.push(cur);
    return { ranges, max };
  }, [stepEvents, steps.length]);

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

    // If the user is mid-drag, defer the rebuild — wiping the SVG out from
    // under their cursor cancels the gesture and yanks the camera around.
    if (isDraggingRef.current) {
      pendingRenderRef.current = true;
      return;
    }

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

    const newPaths: string[] = [];
    for (const p of currentPaths) {
      if (!knownPathsRef.current.has(p)) newPaths.push(p);
    }

    // The bounce/draw-in is meant for *streaming* reveals — a node that
    // appears mid-session as Claude touches a new file. On initial load
    // (or session switch) every path is "new" by definition; animating
    // them turns into a staggered cascade where links draw in first and
    // nodes pop in seconds later. Two guards skip that cascade:
    //   1. Initial load — knownPathsRef is empty, so the entire tree is
    //      "new". Show it in place, no animation.
    //   2. Bulk reveal — slider jumps or batched stream updates can dump
    //      many new paths at once. Capping the bounce at 10 keeps the
    //      effect feeling like a delight on real streaming, not a chore.
    const isInitialLoad = knownPathsRef.current.size === 0;
    const animateFresh =
      !isInitialLoad && newPaths.length > 0 && newPaths.length <= 10;
    const freshPaths: Set<string> = animateFresh
      ? new Set(newPaths)
      : new Set();

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
        if (event.sourceEvent) {
          userInteractedRef.current = true;
          isDraggingRef.current = true;
          recentlyDraggedRef.current = true;
          if (dragSettleTimeoutRef.current) {
            clearTimeout(dragSettleTimeoutRef.current);
          }
        }
      })
      .on('end', (event) => {
        if (!event.sourceEvent) return;
        isDraggingRef.current = false;
        // Wait 300ms after drag ends before allowing new animations
        dragSettleTimeoutRef.current = window.setTimeout(() => {
          recentlyDraggedRef.current = false;
        }, 300);
        // Replay any renders that were queued while the user was dragging.
        if (pendingRenderRef.current) {
          pendingRenderRef.current = false;
          setRenderTick((t) => t + 1);
        }
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

    // Stagger fresh nodes from root → leaf so a deep "src/foo/bar.tsx"
    // reveal pops in segment-by-segment instead of all at once. Depth is
    // derived from the path slash count; ties are broken by lexical order.
    if (freshPaths.size > 1) {
      const orderedFresh = [...freshPaths].sort((a, b) => {
        const da = a ? a.split('/').length : 0;
        const db = b ? b.split('/').length : 0;
        if (da !== db) return da - db;
        return a.localeCompare(b);
      });
      const delayMap = new Map<string, number>();
      orderedFresh.forEach((p, i) => delayMap.set(p, i * 70));
      nodes.style('--map-fresh-delay', (d: any) => {
        const delay = delayMap.get(d.data.path);
        return delay != null ? `${delay}ms` : null;
      });
    }

    // Inner group — all visible children live inside this wrapper so the
    // bounce-in animation can scale the whole composition uniformly without
    // clobbering the outer group's `translate(d.y, d.x)` positioning. (CSS
    // transforms on SVG <g> replace the transform attribute, which would
    // snap fresh nodes back to the origin mid-animation.)
    const nodeInner = nodes
      .append('g')
      .attr('class', 'map-node-inner');

    // Card body
    nodeInner
      .append('rect')
      .attr('class', 'map-node-rect')
      .attr('x', -NODE_W / 2)
      .attr('y', -NODE_H / 2)
      .attr('width', NODE_W)
      .attr('height', NODE_H)
      .attr('rx', NODE_RADIUS)
      .attr('ry', NODE_RADIUS);

    // Status stripe — left edge accent, the strongest at-a-glance signal
    // for read/write/dim. Inset top/bottom so it reads as a stripe, not
    // an extra border.
    nodeInner
      .append('rect')
      .attr('class', 'map-node-stripe')
      .attr('x', -NODE_W / 2 + 3)
      .attr('y', -NODE_H / 2 + STATUS_STRIPE_INSET)
      .attr('width', STATUS_STRIPE_W)
      .attr('height', NODE_H - STATUS_STRIPE_INSET * 2)
      .attr('rx', STATUS_STRIPE_W / 2)
      .attr('ry', STATUS_STRIPE_W / 2);

    // Icon tile — rounded square with a subtly tinted background so the
    // glyph has presence. The tint follows the node status, giving each
    // file a cohesive identity instead of a floating outline.
    nodeInner
      .append('rect')
      .attr('class', 'map-node-icon-tile')
      .attr('x', ICON_TILE_X)
      .attr('y', -ICON_TILE / 2)
      .attr('width', ICON_TILE)
      .attr('height', ICON_TILE)
      .attr('rx', ICON_TILE_RADIUS)
      .attr('ry', ICON_TILE_RADIUS);

    const iconWrap = nodeInner
      .append('svg')
      .attr('class', 'map-node-iconwrap')
      .attr('x', ICON_TILE_X + (ICON_TILE - ICON_GLYPH) / 2)
      .attr('y', -ICON_GLYPH / 2)
      .attr('width', ICON_GLYPH)
      .attr('height', ICON_GLYPH)
      .attr('viewBox', '0 0 24 24')
      .attr('overflow', 'visible');

    iconWrap
      .append('path')
      .attr('class', 'map-node-iconpath')
      .attr('d', (d: any) => iconFor((d as any).data.type))
      .attr('fill', 'none')
      .attr('stroke-width', 1.9)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('vector-effect', 'non-scaling-stroke');

    // Chip width helper — every chip is sized exactly to fit its R/W
    // letter + count with consistent padding, so the text never overlaps
    // regardless of how many digits the count has.
    const chipWidthFor = (count: number) => {
      const digits = String(count).length;
      return CHIP_PAD_X + CHIP_LETTER_W + CHIP_MID_GAP + digits * CHIP_DIGIT_W + CHIP_PAD_X;
    };

    nodeInner.each(function (d) {
      const data = d.data;
      const r = data.readCount;
      const w = data.writeCount;
      if (r === 0 && w === 0) return;
      const chips: Array<{ kind: 'read' | 'write'; count: number; w: number }> = [];
      if (r > 0) chips.push({ kind: 'read', count: r, w: chipWidthFor(r) });
      if (w > 0) chips.push({ kind: 'write', count: w, w: chipWidthFor(w) });

      const node = d3.select(this);
      let xRight = NODE_W / 2 - RIGHT_PAD;
      for (let i = chips.length - 1; i >= 0; i--) {
        const chip = chips[i];
        const xLeft = xRight - chip.w;
        const grp = node
          .append('g')
          .attr('class', `map-node-chip map-node-chip-${chip.kind}`)
          .attr('transform', `translate(${xLeft}, ${-CHIP_H / 2})`);
        grp
          .append('rect')
          .attr('class', 'map-node-chip-bg')
          .attr('width', chip.w)
          .attr('height', CHIP_H)
          .attr('rx', CHIP_H / 2)
          .attr('ry', CHIP_H / 2);
        grp
          .append('text')
          .attr('class', 'map-node-chip-kind')
          .attr('x', CHIP_PAD_X)
          .attr('y', CHIP_H / 2 + 3.6)
          .text(chip.kind === 'read' ? 'R' : 'W');
        grp
          .append('text')
          .attr('class', 'map-node-chip-count')
          .attr('x', chip.w - CHIP_PAD_X)
          .attr('y', CHIP_H / 2 + 3.6)
          .attr('text-anchor', 'end')
          .text(String(chip.count));
        xRight = xLeft - CHIP_GAP;
      }
    });

    // Label — sits between the icon tile and the right-side chip cluster.
    // The truncation budget is computed per-node from the actual chip
    // widths so long filenames never run into the chips.
    nodeInner
      .append('text')
      .attr('class', 'map-node-label')
      .attr('x', LABEL_X)
      .attr('y', 4.5)
      .text((d) => {
        const data = d.data;
        let chipsW = 0;
        if (data.readCount > 0) chipsW += chipWidthFor(data.readCount);
        if (data.writeCount > 0) chipsW += chipWidthFor(data.writeCount);
        if (data.readCount > 0 && data.writeCount > 0) chipsW += CHIP_GAP;
        const reservedRight = chipsW > 0 ? chipsW + 8 : 0;
        // Label spans from LABEL_X to (right edge − RIGHT_PAD − reservedRight).
        const labelMaxPx = NODE_W / 2 - RIGHT_PAD - reservedRight - LABEL_X;
        const maxChars = Math.max(10, Math.floor(labelMaxPx / LABEL_CHAR_W));
        return truncateMiddle(data.name, maxChars);
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

    // Sub-agent touched nodes get a refined corner pill. The status stripe
    // already conveys read/write, so we don't double up with a left ribbon.
    const agentNodes = nodeInner.filter((d) => d.data.agentTouched);

    const agentPill = agentNodes
      .append('g')
      .attr('class', 'map-node-agent-pill')
      .attr(
        'transform',
        `translate(${NODE_W / 2 - AGENT_PILL_W - 8},${-NODE_H / 2 - AGENT_PILL_H / 2 + 4})`
      );

    agentPill
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', AGENT_PILL_W)
      .attr('height', AGENT_PILL_H)
      .attr('rx', AGENT_PILL_H / 2)
      .attr('ry', AGENT_PILL_H / 2);

    agentPill
      .append('text')
      .attr('x', AGENT_PILL_W / 2)
      .attr('y', AGENT_PILL_H / 2 + 3.6)
      .attr('text-anchor', 'middle')
      .text('AGENT');

    // Apply bounce animation to fresh nodes via D3 transition
    if (freshPaths.size > 0) {
      nodes
        .filter((d: any) => freshPaths.has(d.data.path))
        .each(function(d: any) {
          const node = d3.select(this);
          const currentTransform = node.attr('transform') || '';
          node.attr('transform', currentTransform + ' scale(0.01)');
          node
            .transition()
            .duration(500)
            .ease(d3.easeElasticOut)
            .attr('transform', currentTransform);
        });
    }

    // Camera: auto-pan to last revealed node, otherwise fit
    const lastNode = root3.descendants().find((d) => d.data.path === lastRevealedPath);
    const isFreshReveal =
      !!lastRevealedPath && lastRevealedPath !== prevLastRevealedRef.current;
    prevLastRevealedRef.current = lastRevealedPath;

    const applyTransform = (t: d3.ZoomTransform, animate: boolean) => {
      const sel = animate ? svg.transition().duration(550).ease(d3.easeCubicOut) : svg;
      (sel as any).call(zoom.transform, t);
    };

    if (!userInteractedRef.current && lastNode && lastRevealedPath) {
      // First reveal before any user interaction — center on it.
      const k = preservedScale;
      const tx = width / 2 - (lastNode as any).y * k;
      const ty = height / 2 - (lastNode as any).x * k;
      applyTransform(d3.zoomIdentity.translate(tx, ty).scale(k), false);
    } else if (userInteractedRef.current) {
      // Once the user has touched the canvas, the view is theirs. Keep their
      // pan/zoom across re-renders so streaming new nodes never yanks the
      // camera. They can press the reset-view button to recenter manually.
      void isFreshReveal;
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
  }, [root, lastRevealedPath, lastAppliedStep, renderTick]);

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

        <div className="map-slider-wrap">
          <div className="map-slider-track">
            <div
              className="map-slider-progress"
              style={{
                width: `${(currentStep / Math.max(steps.length, 1)) * 100}%`,
              }}
            />
            {activityRanges.ranges.map((r, i) => {
              const max = activityRanges.max;
              const left = (r.start / max) * 100;
              const width = ((r.end - r.start + 1) / max) * 100;
              return (
                <div
                  key={i}
                  className={`map-slider-mark map-slider-mark-${r.kind}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={
                    r.start === r.end
                      ? `${r.kind} at step ${r.start}`
                      : `${r.kind} during steps ${r.start}–${r.end}`
                  }
                />
              );
            })}
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
        </div>

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
          <span className="map-stat-value">{truncateMiddle(cwd.split('/').slice(-2).join('/'), 32)}</span>
        </div>
      </div>
    </div>
  );
};

export default MapTab;
