export const COLORS = {
  ocean900: "#07131E",
  ocean800: "#0B1B2B",
  ocean700: "#102539",
  ocean600: "#16324B",
  foam: "#EAF4F4",
  mist: "#9DB4C4",
  faint: "#5E7789",
  tide: "#38C4B0",
  tideDeep: "#1E8A7C",
  sand: "#E9D8B4",
  coral: "#F0997B",
  cardBorder: "rgba(157,180,196,0.10)",
  rowBorder: "rgba(157,180,196,0.08)",
  radius: 16,
  fontDisplay: "'Sora', sans-serif",
};

export function buildWavePath(values, width = 1000, height = 110, padTop = 16, padBottom = 8) {
  const n = values.length;
  if (n < 2) return { line: "", fill: "", end: [0, height] };
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * width;
    const y = height - padBottom - ((v - min) / range) * (height - padTop - padBottom);
    return [x, y];
  });
  let line = `M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = ((x0 + x1) / 2).toFixed(2);
    line += ` C ${cx},${y0.toFixed(2)} ${cx},${y1.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  const fill = `${line} L ${width},${height} L 0,${height} Z`;
  return { line, fill, end: pts[pts.length - 1] };
}