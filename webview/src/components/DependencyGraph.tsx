import { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { Step } from '../types/session';
import './DependencyGraph.css';

interface Props {
  steps: Step[];
  filesRead: string[];
  filesWritten: string[];
  onGoToStep?: (index: number) => void;
}

interface GraphNode {
  id: string;
  name: string;
  type: 'file' | 'step';
  stepIndex?: number;
  readCount?: number;
  writeCount?: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: 'read' | 'write';
  stepIndex: number;
}

const DependencyGraph = ({ steps, filesRead, filesWritten, onGoToStep }: Props) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Create file nodes
    const allFiles = [...new Set([...filesRead, ...filesWritten])];
    allFiles.forEach(file => {
      const fileName = file.split('/').pop() || file;
      const node: GraphNode = {
        id: `file:${file}`,
        name: fileName,
        type: 'file',
        readCount: filesRead.filter(f => f === file).length,
        writeCount: filesWritten.filter(f => f === file).length,
      };
      nodes.push(node);
      nodeMap.set(node.id, node);
    });

    // Create links from steps
    steps.forEach(step => {
      if (step.toolName === 'Read' && step.toolInput?.file_path) {
        const fileId = `file:${step.toolInput.file_path}`;
        if (nodeMap.has(fileId)) {
          links.push({
            source: fileId,
            target: fileId,
            type: 'read',
            stepIndex: step.index,
          });
        }
      } else if ((step.toolName === 'Write' || step.toolName === 'Edit') && step.toolInput?.file_path) {
        const fileId = `file:${step.toolInput.file_path}`;
        if (nodeMap.has(fileId)) {
          links.push({
            source: fileId,
            target: fileId,
            type: 'write',
            stepIndex: step.index,
          });
        }
      }
    });

    // Limit nodes for performance
    return {
      nodes: nodes.slice(0, 50),
      links: links.slice(0, 100),
    };
  }, [steps, filesRead, filesWritten]);

  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const width = 800;
    const height = 600;

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Create force simulation
    const simulation = d3.forceSimulation(graphData.nodes as any)
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // Add zoom
    const g = svg.append('g');
    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      }) as any);

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('class', (d: GraphLink) => `link ${d.type}`)
      .attr('stroke', (d: GraphLink) => d.type === 'read' ? '#569CD6' : '#4EC9B0')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6);

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag<any, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);

    node.append('circle')
      .attr('r', (d: GraphNode) => {
        const count = (d.readCount || 0) + (d.writeCount || 0);
        return 10 + Math.min(count * 2, 20);
      })
      .attr('fill', (d: GraphNode) => {
        if ((d.writeCount || 0) > 0) return '#4EC9B0';
        return '#569CD6';
      })
      .attr('stroke', '#1E1E1E')
      .attr('stroke-width', 2);

    node.append('text')
      .text((d: GraphNode) => d.name)
      .attr('x', 0)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', '#CCCCCC')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace');

    // Add tooltips
    node.append('title')
      .text((d: GraphNode) => {
        const reads = d.readCount || 0;
        const writes = d.writeCount || 0;
        return `${d.name}\nReads: ${reads}\nWrites: ${writes}`;
      });

    // Simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [graphData]);

  if (graphData.nodes.length === 0) {
    return (
      <div className="dependency-graph-empty">
        <span className="empty-icon">🕸️</span>
        <p>No file dependencies to visualize</p>
        <span className="empty-hint">Files read or written will appear here</span>
      </div>
    );
  }

  return (
    <div className="dependency-graph">
      <div className="graph-header">
        <h3>📊 Interactive Dependency Graph</h3>
        <p className="graph-hint">
          Drag nodes to explore • Scroll to zoom •
          <span className="color-legend">
            <span className="legend-item">
              <span className="legend-dot read"></span>Read-only
            </span>
            <span className="legend-item">
              <span className="legend-dot write"></span>Written
            </span>
          </span>
        </p>
      </div>
      <div className="graph-container">
        <svg ref={svgRef}></svg>
      </div>
      <div className="graph-stats">
        <div className="stat-item">
          <span className="stat-label">Files:</span>
          <span className="stat-value">{graphData.nodes.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Operations:</span>
          <span className="stat-value">{graphData.links.length}</span>
        </div>
      </div>
    </div>
  );
};

export default DependencyGraph;
