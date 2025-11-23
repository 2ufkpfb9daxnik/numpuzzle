// shape definitions and labels
export const shapes = [
  {name:'star', path:'M50 15 L61 39 L88 39 L66 57 L75 84 L50 68 L25 84 L34 57 L12 39 L39 39 Z'},
  {name:'square', path:'M15 15 H85 V85 H15 Z'},
  {name:'triangle', path:'M50 15 L85 85 H15 Z'},
  {name:'circle', path:'CIRCLE'},
  {name:'revtriangle', path:'M50 85 L15 15 H85 Z'},
  {name:'heart', path:'M50 78 L18 46 A18 18 0 1 1 50 30 A18 18 0 1 1 82 46 Z'},
  {name:'diamond', path:'M50 12 L88 50 L50 88 L12 50 Z'},
  {name:'fish', path:'M18 50 C30 32 56 28 74 36 C82 40 90 42 90 50 C90 58 82 60 74 64 C56 72 30 68 18 50 Z'}
];

const labelMap = {star:'星', square:'四角', triangle:'三角', circle:'丸', revtriangle:'逆三角', heart:'ハート', diamond:'ひし形', fish:'魚'};
export function getShapeLabel(idx){ const s = shapes[idx]; if(!s) return String(idx); return labelMap[s.name] || s.name; }
