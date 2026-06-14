/**
 * SoraTomo — Rarity Engine
 * Extracted from App.jsx for code-splitting and independent testing.
 *
 * computeRarity(icaoType, cat, priorCount) → { score, key, label, color }
 */

export const GLOBAL_RARITY = [
  // Ultra-common narrowbodies
  ['A320',6],['A319',8],['A321',8],['A20N',7],['A21N',8],
  ['B737',6],['B738',5],['B739',7],['B38M',8],['B39M',9],['E75',12],['E70',14],
  ['CRJ',13],['CRJ9',13],['CRJ7',14],['CRJ2',18],['E190',12],['E195',14],['E145',20],
  // Widebodies
  ['B772',52],['B77W',52],['B788',52],['B789',52],['B78X',54],
  ['A332',50],['A333',50],['A339',56],['A359',56],['A35K',60],['B763',48],['B764',54],
  // Jumbos / superjumbos
  ['B748',78],['B744',70],['B742',88],['B743',88],['A388',80],
  // GA / bizjets — C17x entries MUST appear before ['C17',...] (C-17 Globemaster)
  // so that longest-prefix match selects the correct Cessna score.
  ['C150',10],['C152',10],['C170',10],['C172',10],['C175',10],
  ['C177',10],['C178',10],['C180',12],['C182',10],['C185',12],
  ['C206',14],['C207',14],['C208',18],
  ['PA18',12],['PA28',10],['PA32',14],['PA44',16],
  ['SR20',22],['SR22',24],['DA40',30],['DA42',32],
  ['C25',14],['C56X',16],['GLF',20],['GLEX',22],['CL60',18],['LJ',18],['PC12',16],
  // Helicopters
  ['R44',30],['R66',34],['B06',32],['EC',38],['AW1',44],['S76',46],['UH',60],
  // Military
  ['F16',72],['F15',74],['F18',74],['F22',92],['F35',88],['A10',86],
  ['C130',64],['C17',74],['KC',70],['C5',90],['E3',86],['P8',72],['V22',84],
  ['B52',95],['B1',94],['B2',99],
  // Heritage / ultra-rare
  ['AN12',92],['AN124',97],['AN225',100],['A124',97],['IL76',90],
  ['DC3',96],['B17',99],['SR7',100],
];

export const CAT_RARITY = {
  narrow:10, regional:16, wide:34, jumbo:74, super:80,
  bizjet:18, piston:22, helicopter:36, military:80, milTransport:72, '':24,
};

export const globalRarity = (icaoType, cat) => {
  const t = (icaoType||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  let best=null, bestLen=-1;
  if(t) for(const [pre,score] of GLOBAL_RARITY){
    if(t.startsWith(pre) && pre.length>bestLen){ best=score; bestLen=pre.length; }
  }
  return best!=null ? best : (CAT_RARITY[cat] ?? 24);
};

/**
 * Blend global scarcity (70%) with personal novelty (30%).
 * priorCount = number of times this user has already caught this type.
 */
export const computeRarity = (icaoType, cat, priorCount=0) => {
  const g        = globalRarity(icaoType, cat);
  const personal = 100 * Math.exp(-priorCount/3);
  const score    = Math.round(0.70*g + 0.30*personal);
  const tier =
    score>=85 ? {key:'mythic',   label:'MYTHIC',    color:'#ef4444'} :
    score>=70 ? {key:'legendary',label:'LEGENDARY', color:'#f59e0b'} :
    score>=50 ? {key:'rare',     label:'RARE',      color:'#fbbf24'} :
    score>=40 ? {key:'uncommon', label:'UNCOMMON',  color:'#2dffb4'} :
                {key:'common',   label:'COMMON',    color:'#7a98a8'};
  return {score, ...tier};
};