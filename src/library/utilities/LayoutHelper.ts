import { create } from "domain";
import { Chit } from "../game/Chit";
import { PanelLayout, PanelLayoutRow } from "../game/PanelChit";

export type LayoutDirection =
  | "horizontal"
  | "vertical"
  | "optimize"
  | "optimizePreferVertical"
  | "optimizePreferHorizontal"
  | "optimizeGrid";

//
// Input parameters
//
export interface PanelNode {
  panel: Chit | Chit[];
  minWidth: number;
  minHeight: number;
}
export interface ContainerNode {
  direction: LayoutDirection;
  splits: LayoutNode[];
  collapseOrder?: number;
}
export type LayoutNode = PanelNode | ContainerNode;

//
// Interim concrete panel nodes
//
type ConcreteDirection = "horizontal" | "vertical";

interface ConcretePanelNode extends PanelNode {
  width: number;
  height: number;
}
interface ConcreteContainerNode {
  width: number;
  height: number;
  direction: ConcreteDirection;
  splits: ConcreteLayoutNode[];
  collapseOrder?: number;
}
type ConcreteLayoutNode = ConcretePanelNode | ConcreteContainerNode;

// Type guard helpers
function isPanelNode(node: LayoutNode | ConcreteLayoutNode): node is PanelNode {
  return "panel" in node;
}

/**
 * Main entry point: creates layout from tree specification
 */
export function createLayoutFromTree(tree: LayoutNode, availableWidth: number, availableHeight: number): PanelLayout {
  console.log("Creating layout for", tree, availableWidth, availableHeight);

  // Step 1: Build valid LayoutNode tree (with collapses applied)
  const validTree = buildValidTree(tree, availableWidth, availableHeight);

  console.log("validTree", validTree);

  // Step 2: Convert the valid tree to PanelLayout
  const res = treeToLayout(validTree);
  console.log(res);
  return res;
}

/**
 * Builds a valid LayoutNode tree by applying collapses until everything fits
 * Returns a NEW tree - does not modify the input
 */
function buildValidTree(tree: LayoutNode, width: number, height: number): ConcreteLayoutNode {
  // Step 1: Attempt to layout - resolves all optimize* into concrete horizontal/vertical/grid
  const concreteTree = createConcreteLayout(tree, width, height);

  // Step 2: Check if the concrete layout has ANY violations
  const hasViolations = checkConcreteViolations(concreteTree);

  // If no violations, the original tree is valid!
  if (!hasViolations) {
    console.log("Tree is valid - everything fits!");
    return concreteTree;
  }

  console.log(
    `Found violations in ${width.toFixed(0)}×${height.toFixed(0)} - scanning entire tree for smallest collapseOrder`,
  );

  // Step 3: Scan ENTIRE tree for the container with smallest collapseOrder
  const toCollapse = findSmallestCollapseOrder(tree);

  if (!toCollapse) {
    return concreteTree;
  }

  console.log(`Collapsing container with collapseOrder=${toCollapse.collapseOrder ?? "default"}`);

  // Step 4: Collapse that container to create NEW tree
  const newTree = collapseContainer(tree, toCollapse);

  // Step 5: Recursively build valid tree from the new tree
  return buildValidTree(newTree, width, height);
}

function createHorizontalLayout(node: ContainerNode, width: number, height: number): ConcreteLayoutNode {
  const widths = node.splits.map((split) => getMinWidth(split));
  const totalUsedWidth = widths.reduce((sum, w) => sum + w, 0);
  const scale = width / totalUsedWidth;
  const splits = node.splits.map((split, i) => createConcreteLayout(split, widths[i] * scale, height));

  return {
    width,
    height,
    collapseOrder: node.collapseOrder,
    direction: "horizontal",
    splits,
  };
}

function createVerticalLayout(node: ContainerNode, width: number, height: number): ConcreteLayoutNode {
  const heights = node.splits.map((split) => getMinHeight(split));
  const totalUsedHeight = heights.reduce((sum, h) => sum + h, 0);
  const scale = height / totalUsedHeight;
  const splits = node.splits.map((split, i) => createConcreteLayout(split, width, heights[i] * scale));

  return {
    collapseOrder: node.collapseOrder,
    direction: "vertical",
    splits,
    width,
    height,
  };
}

/**
 * Attempts to layout the tree - resolves all optimize* directions into concrete layouts
 * Returns a ConcreteLayoutNode tree
 */
function createConcreteLayout(node: LayoutNode, width: number, height: number): ConcreteLayoutNode {
  if (isPanelNode(node)) {
    return {
      ...node,
      width,
      height,
    };
  }

  const container = node as ContainerNode;

  // general "optimize"
  if (container.direction === "optimize") {
    const horizontalLayout = createHorizontalLayout(container, width, height);
    const verticalLayout = createVerticalLayout(container, width, height);

    const horizontalIsOkay = checkConcreteViolations(horizontalLayout);
    const verticalIsOkay = checkConcreteViolations(verticalLayout);

    if (horizontalIsOkay && verticalIsOkay) {
      if (width >= height) {
        return horizontalLayout;
      } else {
        return verticalLayout;
      }
    } else if (horizontalIsOkay) {
      return horizontalLayout;
    } else if (verticalIsOkay) {
      return verticalLayout;
    } else {
      return horizontalLayout;
    }
  }
  // "optimize" with a preference
  else if (container.direction === "optimizePreferVertical" || container.direction === "optimizePreferHorizontal") {
    const horizontalLayout = createHorizontalLayout(container, width, height);
    const verticalLayout = createVerticalLayout(container, width, height);

    const horizontalIsOkay = checkConcreteViolations(horizontalLayout);
    const verticalIsOkay = checkConcreteViolations(verticalLayout);

    if (
      container.direction === "optimizePreferHorizontal" &&
      (horizontalIsOkay || (!verticalIsOkay && !horizontalIsOkay))
    ) {
      return horizontalLayout;
    } else if (
      container.direction === "optimizePreferVertical" &&
      (verticalIsOkay || (!verticalIsOkay && !horizontalIsOkay))
    ) {
      return verticalLayout;
    } else if (verticalIsOkay) {
      return verticalLayout;
    } else if (horizontalIsOkay) {
      return horizontalLayout;
    } else {
      return verticalLayout; // fallback, shouldn't happen.
    }
  }
  // grid layout
  else if (container.direction === "optimizeGrid") {
    // Grid is just an optimization - resolve to actual horizontal or vertical layout
    const bestConfig = findBestGridConfig(container.splits, width, height);

    const result: ConcreteContainerNode[] = [];
    for (let row = 0; row < bestConfig.rows; row++) {
      const rowInfo: ConcreteContainerNode = {
        direction: "horizontal",
        width: width,
        height: height / bestConfig.rows,
        splits: container.splits
          .slice(row * bestConfig.cols, (row + 1) * bestConfig.cols)
          .map((d) => createConcreteLayout(d, width / bestConfig.cols, height / bestConfig.rows)),
      };
      result.push(rowInfo);
    }

    return {
      direction: "vertical",
      width,
      height,
      splits: result,
    };
  } else {
    return {
      direction: container.direction as ConcreteDirection,
      width,
      height,
      splits: container.splits.map((split) => createConcreteLayout(split, width, height)),
    };
  }
}

/**
 * Check if a concrete layout has violations
 */
function checkConcreteViolations(node: ConcreteLayoutNode): boolean {
  if (isPanelNode(node)) {
    return node.minWidth > node.width || node.minHeight > node.height;
  }
  return node.splits.find((split) => checkConcreteViolations(split)) !== undefined;
}

/**
 * Scans entire tree for the container with smallest collapseOrder
 */
function findSmallestCollapseOrder(node: LayoutNode): ContainerNode | null {
  if (isPanelNode(node)) {
    return null;
  }

  const container = node as ContainerNode;
  let smallest: ContainerNode | null = container.collapseOrder !== undefined ? container : null;

  for (const split of container.splits) {
    const childSmallest = findSmallestCollapseOrder(split);
    if (childSmallest) {
      const childOrder = childSmallest.collapseOrder ?? Number.MAX_SAFE_INTEGER;
      const currentOrder = smallest?.collapseOrder ?? Number.MAX_SAFE_INTEGER;

      if (childOrder < currentOrder) {
        smallest = childSmallest;
      }
    }
  }

  return smallest;
}

/**
 * Converts a valid LayoutNode tree to PanelLayout
 */
function treeToLayout(node: ConcreteLayoutNode): PanelLayout {
  if (isPanelNode(node)) {
    return node.panel;
  }

  const container = node as ConcreteContainerNode;
  const direction = container.direction;

  if (direction === "horizontal") {
    return buildHorizontalLayout(container);
  } else {
    return buildVerticalLayout(container);
  }
}

function buildHorizontalLayout(container: ConcreteContainerNode): PanelLayout {
  return {
    height: container.height,
    contents: container.splits.map((split) => treeToLayout(split)).flat(),
  };
}

function buildVerticalLayout(container: ConcreteContainerNode): PanelLayout {
  return {
    width: container.width,
    contents: container.splits.map((split) => treeToLayout(split)).flat(),
  };
}

function findBestGridConfig(splits: LayoutNode[], width: number, height: number): { rows: number; cols: number } {
  if (splits.length <= 1) {
    return { rows: 1, cols: 1 };
  }

  const cellWidth = getMinWidth(splits[0]);
  const cellHeight = getMinHeight(splits[0]);

  let cols = Math.floor(width / cellWidth);
  let rows = Math.floor(height / cellHeight);
  let lastValidCols = cols;
  let lastValidRows = rows;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let canReduceRows = rows > 1 && cols * (rows - 1) >= splits.length;
    let canReduceCols = cols > 1 && (cols - 1) * rows >= splits.length;

    if (!canReduceRows && !canReduceCols) {
      break;
    }

    if (canReduceRows && canReduceCols) {
      const cellAspectRatio = cellWidth / cellHeight;

      // Prefer reducing the dimension that brings cellAspectRatio closer to aspectRatio
      const reduceRowsScore = Math.abs(cellAspectRatio - cellWidth / (height / (rows - 1)));
      const reduceColsScore = Math.abs(cellAspectRatio - width / (cols - 1) / cellHeight);

      if (reduceRowsScore < reduceColsScore) {
        canReduceRows = false;
      } else {
        canReduceCols = false;
      }
    }

    if (canReduceRows) {
      rows--;
      lastValidCols = cols;
      lastValidRows = rows;
    } else if (canReduceCols) {
      cols--;
      lastValidCols = cols;
      lastValidRows = rows;
    }
  }

  return {
    rows: lastValidRows,
    cols: lastValidCols,
  };
}

/**
 * Collapse a container - replaces it with a PanelNode (tabs) and removes collapseOrder
 */
function collapseContainer(tree: LayoutNode, targetContainer: ContainerNode): LayoutNode {
  if (tree === targetContainer) {
    // This is the container to collapse
    const panels: PanelNode[] = [];
    collectPanels(targetContainer, panels);

    const maxWidth = Math.max(...panels.map((s) => s.minWidth));
    const maxHeight = Math.max(...panels.map((s) => s.minHeight));

    // Return PanelNode with array of panels (tabs) - NO collapseOrder
    return {
      panel: panels.map((p) => p.panel).flat(),
      minWidth: maxWidth,
      minHeight: maxHeight,
    };
  }

  if (isPanelNode(tree)) {
    return tree;
  }

  // Recurse through container
  const container = tree as ContainerNode;
  return {
    ...container,
    splits: container.splits.map((split) => collapseContainer(split, targetContainer)),
  };
}

function collectPanels(node: LayoutNode, panels: PanelNode[]): void {
  if (isPanelNode(node)) {
    panels.push(node);
  } else {
    for (const split of node.splits) {
      collectPanels(split, panels);
    }
  }
}

/**
 * Get minWidth for a node (without resolving - for estimating)
 */
function getMinWidth(node: LayoutNode | ConcreteLayoutNode): number {
  if (isPanelNode(node)) {
    return node.minWidth;
  }

  const container = node as ContainerNode | ConcreteContainerNode;

  // ConcreteLayoutNode - direction is already resolved
  if (container.direction === "horizontal" || container.direction === "optimizePreferHorizontal") {
    return container.splits.reduce((sum, split) => sum + getMinWidth(split), 0);
  }

  // LayoutNode - need to estimate based on direction type
  if (container.direction === "optimizeGrid") {
    const w = getMinWidth(container.splits[0]);
    return Math.sqrt(container.splits.length) * w;
  }

  return Math.max(...container.splits.map((split) => getMinWidth(split)));
}

function getMinHeight(node: LayoutNode | ConcreteLayoutNode): number {
  if (isPanelNode(node)) {
    return node.minHeight;
  }

  const container = node as ContainerNode | ConcreteContainerNode;

  // ConcreteLayoutNode - direction is already resolved
  if (container.direction === "vertical" || container.direction === "optimizePreferVertical") {
    return container.splits.reduce((sum, split) => sum + getMinHeight(split), 0);
  }

  // LayoutNode - need to estimate based on direction type
  if (container.direction === "optimizeGrid") {
    const h = getMinHeight(container.splits[0]);
    return Math.sqrt(container.splits.length) * h;
  }

  return Math.max(...container.splits.map((split) => getMinHeight(split)));
}
