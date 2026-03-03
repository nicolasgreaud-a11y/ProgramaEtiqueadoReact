const PALETTE = [
  "#ee6352",
  "#59cd90",
  "#3fa7d6",
  "#fac05e",
  "#f79d84",
  "#5f0f40",
  "#0f4c5c",
  "#9a031e"
];

export function getColorForIndex(index) {
  return PALETTE[index % PALETTE.length];
}
