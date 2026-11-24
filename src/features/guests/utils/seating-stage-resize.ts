type Point = { x: number; y: number };
type Bounds = Point & { width: number; height: number };

export function resizeStage(
  bounds: Bounds,
  point: Point,
  corner: { west: boolean; north: boolean },
): Bounds {
  const ratio = bounds.width / bounds.height;
  const anchorX = bounds.x + (corner.west ? bounds.width : 0);
  const anchorY = bounds.y + (corner.north ? bounds.height : 0);
  const dx = (point.x - anchorX) * (corner.west ? -1 : 1);
  const dy = (point.y - anchorY) * (corner.north ? -1 : 1);
  const width = Math.min(4000, Math.max(125, (dx + dy / ratio) / (1 + 1 / ratio ** 2)));
  const height = width / ratio;
  return {
    x: anchorX - (corner.west ? width : 0),
    y: anchorY - (corner.north ? height : 0),
    width,
    height,
  };
}
