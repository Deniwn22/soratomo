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
  // Narrowbody — aging / increasingly rare types
  ['B752',28],['B753',34],['B722',80],['MD80',42],['MD88',44],['MD90',48],
  ['A318',30],['A306',60],['A310',58],['MD11',66],['BCS1',16],['BCS3',16],
  // Turboprop regionals (real ICAO codes)
  ['DH8A',24],['DH8B',24],['DH8C',26],['DH8D',22],['AT72',24],['AT75',26],['AT76',26],
  ['AT43',30],['AT45',30],['SF34',40],['SW4',28],['J328',44],['BE99',34],['E545',20],['E550',22],
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
  ['P28A',10],['P28B',10],['P28R',12],['P28T',13],['P32R',14],['P32T',15],['P46T',16],
  ['BE36',12],['BE35',13],['BE33',13],['BE58',14],['BE55',14],['BE76',15],['BE99',34],
  ['M20',12],['AA5',12],['RV6',16],['RV7',16],['RV8',16],['RV9',16],['RV10',18],['RV14',18],
  ['SR20',22],['SR22',24],['DA40',30],['DA42',32],
  ['C25',14],['C56X',16],['GLF',20],['GLEX',22],['CL60',18],['LJ',18],['PC12',16],
  // Helicopters
  ['R44',30],['R66',34],['R22',28],['B06',32],['B407',36],['B412',42],['B429',40],['B505',34],
  ['EC',38],['H125',34],['H130',36],['H135',40],['H145',44],['H155',48],['H160',54],['H175',58],
  ['AW1',44],['AW09',40],['AW39',56],['AW69',60],['AW89',64],['A139',56],['A169',52],['A189',60],
  ['S76',46],['S92',62],['UH',60],['H60',62],['UH60',62],['AH64',55],['CH47',60],['HH60',70],['VH3',96],['VH60',96],
  ['AS50',34],['AS55',38],['AS65',42],['MD5',40],
  // Military
  ['F16',72],['F15',74],['F18',74],['F22',92],['F35',88],['A10',86],
  ['C130',64],['C17',74],['KC',70],['C5',90],['E3',86],['P8',72],['V22',84],
  ['B52',95],['B1',94],['B2',99],
  // Modern military fighters/attack/recon/drones
  ['F4',90],['F5',82],['A4',88],['EA18',86],['AV8',90],['T38',80],['T45',78],
  ['RQ4',92],['MQ9',88],['RQ1',86],['MQ1',86],['U2',96],
  // Military transports / VIP / patrol / AEW (Andrews AFB & carrier traffic)
  ['C40',58],['C32',74],['C37',60],['C12',46],['C20',58],['C21',54],
  ['C2',80],['E2',82],['E6',88],['E8',90],['P3',78],['C27',72],['C146',68],
  ['RC',92],['WC',92],['OC',90],['KC10',74],['KC46',72],['VC',96],
  // Heritage / ultra-rare warbirds & vintage jets
  ['AN12',92],['AN124',97],['AN225',100],['A124',97],['IL76',90],
  ['DC3',96],['B17',99],['SR7',100],
  ['T33',96],['T28',92],['T6',90],['P51',99],['P40',99],['SPIT',100],['BF109',100],['ME16',100],
  ['L29',88],['L39',86],['MG2',94],['MG3',94],['SU27',94],['SU30',94],['SU34',94],['SU57',96],
  ['F4U',99],['F6F',99],['P38',99],['P47',98],['YAK',88],['OV10',90],['T37',84],
  ['B25',98],['B29',99],['PBY',98],['A1',94],['DC6',92],['DC4',92],['CONI',99],
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
 * Deterministic rarity — a function of the aircraft's global scarcity ONLY.
 * The same aircraft type always yields the same tier, regardless of how many
 * times the user has caught it. (priorCount is accepted but ignored, kept for
 * call-site compatibility.)
 *
 * Formula preserves the tiers users already saw on icons: the old display path
 * always passed priorCount=0, giving 0.70*g + 0.30*100 = 0.70*g + 30. We keep
 * exactly that mapping so no aircraft changes tier with this switch — it only
 * makes the SCORED catch match what the icon already showed.
 */
export const computeRarity = (icaoType, cat, _priorCount=0) => {
  const g     = globalRarity(icaoType, cat);
  const score = Math.round(0.70*g + 30);
  const tier =
    score>=85 ? {key:'mythic',   label:'MYTHIC',    color:'#ef4444'} :
    score>=70 ? {key:'legendary',label:'LEGENDARY', color:'#f59e0b'} :
    score>=50 ? {key:'rare',     label:'RARE',      color:'#fbbf24'} :
    score>=40 ? {key:'uncommon', label:'UNCOMMON',  color:'#2dffb4'} :
                {key:'common',   label:'COMMON',    color:'#7a98a8'};
  return {score, ...tier};
};