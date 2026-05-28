import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

const D2R = Math.PI / 180;
const haversine = (la1,lo1,la2,lo2) => {
  const R=6371000,dL=(la2-la1)*D2R,dO=(lo2-lo1)*D2R;
  const a=Math.sin(dL/2)**2+Math.cos(la1*D2R)*Math.cos(la2*D2R)*Math.sin(dO/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
const getBearing = (la1,lo1,la2,lo2) => {
  const dO=(lo2-lo1)*D2R;
  const y=Math.sin(dO)*Math.cos(la2*D2R);
  const x=Math.cos(la1*D2R)*Math.sin(la2*D2R)-Math.sin(la1*D2R)*Math.cos(la2*D2R)*Math.cos(dO);
  return (Math.atan2(y,x)/D2R+360)%360;
};
const getElev  = (distM,altM) => Math.atan2(altM,distM)/D2R;
const mToFt    = m  => Math.round(m*3.28084).toLocaleString();
const msToKts  = ms => Math.round(ms*1.944);
const distNmi  = m  => (m/1852).toFixed(1);
const altColor = altM => {
  const ft=altM*3.28084;
  if(ft>45000) return '#e879f9'; // magenta-purple: extreme altitude (bizjets, some airliners)
  if(ft>38000) return '#a855f7'; // purple:         very high cruise FL380-450
  if(ft>32000) return '#e8f4ff'; // ghost white:    upper cruise FL320-380
  if(ft>25000) return '#b8e4ff'; // ice blue:       cruise FL250-320
  if(ft>18000) return '#4db8ff'; // sky blue:       mid FL180-250
  if(ft>10000) return '#2b9de0'; // blue:           low-mid 10k-18k ft
  return '#0ea5e9';              // bright cyan:    low altitude <10k ft
};
const ALT_MAX=45000, HFOV=85, VFOV=55;

const toScreen = (bear,elev,hdg,fov=HFOV) => {
  let diff=((bear-hdg+540)%360)-180;
  if(Math.abs(diff)>fov/2) return {on:false};
  return {x:50+(diff/(fov/2))*50, y:58-Math.min(Math.max(elev,0)/35,1)*42, on:true};
};
const toScreenTilt = (bear,elev,dHdg,dPitch,hfov=HFOV,vfov=VFOV) => {
  let hDiff=((bear-dHdg+540)%360)-180;
  if(Math.abs(hDiff)>hfov/2) return {on:false};
  const vDiff=elev-dPitch;
  if(Math.abs(vDiff)>vfov/2) return {on:false};
  return {x:50+(hDiff/(hfov/2))*50, y:50-(vDiff/(vfov/2))*50, on:true};
};

const getAircraftCat = (icao, emitter='') => {
  // ADS-B emitter category A7 = rotorcraft — checked first, most reliable
  if(emitter==='A7') return 'helicopter';
  if(!icao) return 'narrow';
  const t=icao.toUpperCase().replace(/[^A-Z0-9]/g,'');

  // ── Fixed-wing size checks ──────────────────────────────────────
  if(/^A38/.test(t)) return 'super';
  if(/^B74/.test(t)) return 'jumbo';
  if(/^B7[6-9]|^A3[3-5]|^A30/.test(t)) return 'wide';
  // Regional jets — includes Fokker F50/F70/F100 (civil turboprops/jets)
  if(/^CRJ|^ERJ|^E[127]\d\d|^RJ|^F5[0-9]|^F7[0-9]|^F10/.test(t)) return 'regional';
  // Bizjets: Gulfstream, Citation, Learjet, Challenger, Falcon, Phenom
  if(/GLF|^G[2-8]\d\d|^GLEX|^GL[5-7]T|^C[5-7]\d\d|^LJ|^CL6|^BE4|^FA[125]0|^FA7|^FA8|^F90[0-9]|^F2TH|^F2000|^PC24|^E50P|^PRM1/.test(t)) return 'bizjet';

  // ── Piston/GA — MUST come before military to avoid C172 → military ──
  // Cessna 1xx/2xx, Piper PA, Cirrus SR, Diamond DA, Mooney, Beech Bonanza, TBM, PC-12
  if(/^C1[5-9]\d|^C20[5-9]|^C21\d|^PA[234]\d|^SR2[02]|^DA[24]\d|^M20|^AA5|^BE[23]\d|^TBM|^PC12|^PL4/.test(t)) return 'piston';

  // ── Helicopters (type-code) — MUST come before military to avoid A109 → military ──
  // Bell, Sikorsky, Robinson, Eurocopter/Airbus-H, AgustaWestland, MD, military rotary
  if(/^B0[6-9]|^B4[0-4]|^S6[0-9]|^S7[0-9]|^S9[0-9]|^R2[0-9]|^R4[0-9]|^R6[0-9]|^EC[2-7]|^AS3[0-5]|^AS5[0-9]|^AW[019]|^H1[02-9]|^H2[0-9]|^MD[6-9]|^A10[9]|^CH4[67]|^UH[16]|^AH[16]|^OH5|^MH6|^HH6/.test(t)) return 'helicopter';

  // ── Military — specific codes only, no false-positive prefixes ──
  // ^C17[A-Z]?$ : C-17 Globemaster (NOT C172 Cessna)
  // ^A10[A-Z]?$ : A-10 Warthog    (NOT A109 AgustaWestland helicopter)
  // ^F[012][0-9] : F-15/16/18/22 etc. (NOT F50/F70 Fokker)
  // Military transports, tankers, patrol: C-17, C-5, C-130, KC-135, E-3, P-8, V-22
  if(/^C17[A-Z]?$|^C5[AM]|^C130|^KC[0-9]|^E3[A-Z]?$|^P8[A-Z]?$|^V22|^MV22/.test(t)) return 'milTransport';
  // Military fighters/attack/bombers: F-series, A-10, B-52/1/2, SR-71, U-2
  // Fighters/attack/bombers — ^FA18 only (was ^FA[0-9] which caught Dassault Falcons)
  if(/^F[012][0-9]|^FA18|^B52|^B1[AB]|^B2A|^A10[A-Z]?$|^U2[A-Z]?$|^SR7/.test(t)) return 'military';

  return 'narrow';
};

const PlaneShape = ({cat, color, fc}) => {
  const f = Math.max(0.38, fc); // floor raised: wings always legible (was 0.08 → near-invisible head-on)

  switch(cat){

    case 'super': {
      // A380 — enormous double-deck, 4 engines, massive wingspan
      const w = Math.max(0.30, f);
      return (<>
        <ellipse cx="0" cy="-0.5" rx="3.3" ry="9.5" fill={color}/>
        {/* Subtle double-deck cross-section */}
        <ellipse cx="0" cy="-4" rx="3.5" ry="3.2" fill={color} opacity="0.22"/>
        {/* Huge swept wings */}
        <polygon points={`-2.8,-1 ${-12*w},4 ${-11.5*w},6.5 -2.8,4.5`} fill={color}/>
        <polygon points={`2.8,-1 ${12*w},4 ${11.5*w},6.5 2.8,4.5`} fill={color}/>
        {/* Wing leading-edge highlights */}
        <polygon points={`-2.8,-1 ${-12*w},4 ${-12.5*w},3.5 -2.8,-1.5`} fill={color} opacity="0.35"/>
        <polygon points={`2.8,-1 ${12*w},4 ${12.5*w},3.5 2.8,-1.5`} fill={color} opacity="0.35"/>
        {/* 4 engines — inboard pair closer in */}
        <ellipse cx={-5.2*w}  cy="0.8" rx={1.6*w}  ry="0.88" fill={color} opacity="0.93"/>
        <ellipse cx={-9.8*w}  cy="3.2" rx={1.5*w}  ry="0.82" fill={color} opacity="0.93"/>
        <ellipse cx={ 5.2*w}  cy="0.8" rx={1.6*w}  ry="0.88" fill={color} opacity="0.93"/>
        <ellipse cx={ 9.8*w}  cy="3.2" rx={1.5*w}  ry="0.82" fill={color} opacity="0.93"/>
        {/* Engine intake rings */}
        <circle cx={-5.2*w}  cy="0.1" r={1.05*w} fill="none" stroke={color} strokeWidth="0.5" opacity="0.5"/>
        <circle cx={-9.8*w}  cy="2.5" r={0.95*w} fill="none" stroke={color} strokeWidth="0.5" opacity="0.5"/>
        <circle cx={ 5.2*w}  cy="0.1" r={1.05*w} fill="none" stroke={color} strokeWidth="0.5" opacity="0.5"/>
        <circle cx={ 9.8*w}  cy="2.5" r={0.95*w} fill="none" stroke={color} strokeWidth="0.5" opacity="0.5"/>
        {/* Large horizontal stabilizer */}
        <polygon points={`-2.2,8.5 ${-7.5*w},11 ${-6.5*w},12 -1.8,9.5`} fill={color} opacity="0.88"/>
        <polygon points={`2.2,8.5 ${7.5*w},11 ${6.5*w},12 1.8,9.5`} fill={color} opacity="0.88"/>
        {/* Fuselage depth spine */}
        <ellipse cx="0" cy="-0.5" rx="1.3" ry="8.8" fill={color} opacity="0.2"/>
      </>);
    }

    case 'jumbo': {
      // B747 — iconic upper-deck hump, 4 engines
      const w = Math.max(0.28, f);
      return (<>
        <ellipse cx="0" cy="-0.5" rx="2.6" ry="9.5" fill={color}/>
        {/* Iconic upper-deck hump — wide oval displaced forward */}
        <ellipse cx="0" cy="-5.5" rx="2.3" ry="3.2" fill={color} opacity="0.52"/>
        <ellipse cx="0" cy="-5.5" rx="1.0" ry="2.8" fill={color} opacity="0.25"/>
        {/* Wings */}
        <polygon points={`-2.2,-1 ${-11.5*w},4.5 ${-10.5*w},6.5 -2.2,4.5`} fill={color}/>
        <polygon points={`2.2,-1 ${11.5*w},4.5 ${10.5*w},6.5 2.2,4.5`} fill={color}/>
        {/* Wing leading-edge highlights */}
        <polygon points={`-2.2,-1 ${-11.5*w},4.5 ${-12*w},4 -2.2,-1.5`} fill={color} opacity="0.35"/>
        <polygon points={`2.2,-1 ${11.5*w},4.5 ${12*w},4 2.2,-1.5`} fill={color} opacity="0.35"/>
        {/* 4 engines */}
        <ellipse cx={-4.8*w} cy="0.8" rx={1.52*w} ry="0.82" fill={color} opacity="0.93"/>
        <ellipse cx={-8.8*w} cy="3.5" rx={1.42*w} ry="0.76" fill={color} opacity="0.93"/>
        <ellipse cx={ 4.8*w} cy="0.8" rx={1.52*w} ry="0.82" fill={color} opacity="0.93"/>
        <ellipse cx={ 8.8*w} cy="3.5" rx={1.42*w} ry="0.76" fill={color} opacity="0.93"/>
        <circle cx={-4.8*w} cy="0.1" r={0.95*w} fill="none" stroke={color} strokeWidth="0.45" opacity="0.5"/>
        <circle cx={ 4.8*w} cy="0.1" r={0.95*w} fill="none" stroke={color} strokeWidth="0.45" opacity="0.5"/>
        {/* Horizontal stabilizer */}
        <polygon points={`-1.8,8 ${-6*w},11 ${-5.5*w},12 -1.5,9`} fill={color} opacity="0.88"/>
        <polygon points={`1.8,8 ${6*w},11 ${5.5*w},12 1.5,9`} fill={color} opacity="0.88"/>
        <ellipse cx="0" cy="-0.5" rx="1.05" ry="8.5" fill={color} opacity="0.2"/>
      </>);
    }

    case 'wide': {
      // B777/787/A330/350 — large twin-engine widebody
      const w = Math.max(0.28, f);
      return (<>
        <ellipse cx="0" cy="-0.5" rx="2.2" ry="9.5" fill={color}/>
        {/* Wide-chord wings */}
        <polygon points={`-2,-0.5 ${-11*w},4 ${-10.5*w},6.5 -2,4.5`} fill={color}/>
        <polygon points={`2,-0.5 ${11*w},4 ${10.5*w},6.5 2,4.5`} fill={color}/>
        {/* Wing leading-edge highlight */}
        <polygon points={`-2,-0.5 ${-11*w},4 ${-11.5*w},3.5 -2,-1`} fill={color} opacity="0.35"/>
        <polygon points={`2,-0.5 ${11*w},4 ${11.5*w},3.5 2,-1`} fill={color} opacity="0.35"/>
        {/* 2 large engines, further from fuselage */}
        <ellipse cx={-7*w}  cy="1.5" rx={1.85*w} ry="0.98" fill={color} opacity="0.93"/>
        <ellipse cx={ 7*w}  cy="1.5" rx={1.85*w} ry="0.98" fill={color} opacity="0.93"/>
        <circle  cx={-7*w}  cy="0.7" r={1.15*w}  fill="none" stroke={color} strokeWidth="0.5" opacity="0.52"/>
        <circle  cx={ 7*w}  cy="0.7" r={1.15*w}  fill="none" stroke={color} strokeWidth="0.5" opacity="0.52"/>
        {/* Horizontal stabilizer */}
        <polygon points={`-1.8,8.5 ${-6*w},11.5 ${-5.5*w},12 -1.5,9.5`} fill={color} opacity="0.88"/>
        <polygon points={`1.8,8.5 ${6*w},11.5 ${5.5*w},12 1.5,9.5`} fill={color} opacity="0.88"/>
        <ellipse cx="0" cy="-0.5" rx="0.88" ry="8.5" fill={color} opacity="0.2"/>
        <ellipse cx="0" cy="-8.8" rx="0.9" ry="1.0" fill={color} opacity="0.45"/>
      </>);
    }

    case 'regional': {
      // CRJ/ERJ — slim, short wings forward, REAR-mounted engines, T-tail
      const w = Math.max(0.32, f);
      return (<>
        <ellipse cx="0" cy="-0.5" rx="1.15" ry="9.5" fill={color}/>
        {/* Short swept wings, placed forward */}
        <polygon points={`-1.1,-2.5 ${-7.5*w},1 ${-7*w},3 -1.1,1.5`} fill={color}/>
        <polygon points={`1.1,-2.5 ${7.5*w},1 ${7*w},3 1.1,1.5`} fill={color}/>
        {/* Wing leading-edge highlight */}
        <polygon points={`-1.1,-2.5 ${-7.5*w},1 ${-7.9*w},0.6 -1.1,-2.9`} fill={color} opacity="0.4"/>
        <polygon points={`1.1,-2.5 ${7.5*w},1 ${7.9*w},0.6 1.1,-2.9`} fill={color} opacity="0.4"/>
        {/* REAR-MOUNTED engines — key visual distinguisher from narrowbody */}
        <ellipse cx={-2.3*w} cy="5.5" rx={1.28*w} ry="0.7"  fill={color} opacity="0.93"/>
        <ellipse cx={ 2.3*w} cy="5.5" rx={1.28*w} ry="0.7"  fill={color} opacity="0.93"/>
        <circle  cx={-2.3*w} cy="4.85" r={0.78*w} fill="none" stroke={color} strokeWidth="0.48" opacity="0.65"/>
        <circle  cx={ 2.3*w} cy="4.85" r={0.78*w} fill="none" stroke={color} strokeWidth="0.48" opacity="0.65"/>
        {/* T-tail horizontal stabilizer — prominent, high-mounted */}
        <polygon points={`-1,9.5 ${-5.5*w},11.5 ${-5*w},12 -0.8,10.3`} fill={color} opacity="0.93"/>
        <polygon points={`1,9.5 ${5.5*w},11.5 ${5*w},12 0.8,10.3`} fill={color} opacity="0.93"/>
        {/* Fuselage spine */}
        <ellipse cx="0" cy="0" rx="0.52" ry="8.8" fill={color} opacity="0.28"/>
        <ellipse cx="0" cy="-8.8" rx="0.6" ry="0.85" fill={color} opacity="0.45"/>
      </>);
    }

    case 'bizjet': {
      // Gulfstream/Citation — very slim, highly-swept wings, rear engines, T-tail
      const w = Math.max(0.30, f);
      return (<>
        <ellipse cx="0" cy="-0.5" rx="0.95" ry="10" fill={color}/>
        {/* Pointed nose */}
        <ellipse cx="0" cy="-9.2" rx="0.58" ry="1.1" fill={color} opacity="0.55"/>
        {/* Highly-swept wings — longer chord toward root */}
        <polygon points={`-1,0 ${-9.5*w},5.5 ${-8.5*w},7 -1,3.5`} fill={color}/>
        <polygon points={`1,0 ${9.5*w},5.5 ${8.5*w},7 1,3.5`} fill={color}/>
        {/* Crisp leading-edge highlight */}
        <polygon points={`-1,0 ${-9.5*w},5.5 ${-10*w},5 -1,-0.4`} fill={color} opacity="0.42"/>
        <polygon points={`1,0 ${9.5*w},5.5 ${10*w},5 1,-0.4`} fill={color} opacity="0.42"/>
        {/* Rear-mounted engines — close to fuselage, aft */}
        <ellipse cx={-1.9*w} cy="5.8" rx={1.12*w} ry="0.6"  fill={color} opacity="0.93"/>
        <ellipse cx={ 1.9*w} cy="5.8" rx={1.12*w} ry="0.6"  fill={color} opacity="0.93"/>
        <circle  cx={-1.9*w} cy="5.2" r={0.68*w}  fill="none" stroke={color} strokeWidth="0.45" opacity="0.62"/>
        <circle  cx={ 1.9*w} cy="5.2" r={0.68*w}  fill="none" stroke={color} strokeWidth="0.45" opacity="0.62"/>
        {/* T-tail horizontal stab — high-mounted */}
        <polygon points={`-0.8,9.5 ${-4.5*w},11 ${-4*w},11.8 -0.6,10.2`} fill={color} opacity="0.93"/>
        <polygon points={`0.8,9.5 ${4.5*w},11 ${4*w},11.8 0.6,10.2`} fill={color} opacity="0.93"/>
        <ellipse cx="0" cy="0" rx="0.44" ry="9" fill={color} opacity="0.28"/>
      </>);
    }

    case 'milTransport': {
      // C-17 Globemaster III — traced from reference silhouette
      // Wide box fuselage, 4 engine pods, spoiler slots, winglets, T-tail
      // Long narrow empennage taper with small T-tail
      const w = Math.max(0.3, f);
      return (<>
        {/* Main body + wings + long tapered empennage + T-tail */}
        <path d={`
          M 0,-12
          C ${1.2*w},-11.6 ${2.8*w},-10.2 ${2.8*w},-8.5
          L ${2.8*w},-2.5
          C ${5.8*w},-1.5 ${9.8*w},0.5 ${12.8*w},3.2
          L ${13.2*w},3.8 L ${13.5*w},4.8
          C ${11*w},5.2 ${8*w},4.8 ${2.8*w},4.2
          C ${2.7*w},5.5 ${2.4*w},7.2 ${2.0*w},9.2
          C ${2.0*w},9.5 ${1.8*w},10.2 ${1.6*w},11
          C ${3.2*w},11.2 ${5.0*w},10.8 ${5.5*w},11.8
          L ${5.8*w},13.5
          L ${5.2*w},14.2
          C ${4.0*w},14.5 ${2.4*w},13.8 ${1.6*w},13.2
          L ${1.2*w},14.5
          L 0,15
          L ${-1.2*w},14.5
          L ${-1.6*w},13.2
          C ${-2.4*w},13.8 ${-4.0*w},14.5 ${-5.2*w},14.2
          L ${-5.8*w},13.5
          L ${-5.5*w},11.8
          C ${-5.0*w},10.8 ${-3.2*w},11.2 ${-1.6*w},11
          C ${-1.8*w},10.2 ${-2.0*w},9.5 ${-2.0*w},9.2
          C ${-2.4*w},7.2 ${-2.7*w},5.5 ${-2.8*w},4.2
          C ${-8*w},4.8 ${-11*w},5.2 ${-13.5*w},4.8
          L ${-13.2*w},3.8 L ${-12.8*w},3.2
          C ${-9.8*w},0.5 ${-5.8*w},-1.5 ${-2.8*w},-2.5
          L ${-2.8*w},-8.5
          C ${-2.8*w},-10.2 ${-1.2*w},-11.6 0,-12
          Z`}
          fill={color}/>
        {/* Winglets */}
        <line x1={13.2*w} y1="4.2" x2={14.2*w} y2="3.5"
          stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <line x1={-13.2*w} y1="4.2" x2={-14.2*w} y2="3.5"
          stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        {/* Trailing edge spoiler slots */}
        {[4.5,6.5,8.5,10.5].map(x=>(
          <g key={x}>
            <line x1={x*w} y1={4.18} x2={x*w+0.4} y2={3.6}
              stroke="#010a18" strokeWidth="0.7" opacity="0.55"/>
            <line x1={-x*w} y1={4.18} x2={-x*w-0.4} y2={3.6}
              stroke="#010a18" strokeWidth="0.7" opacity="0.55"/>
          </g>
        ))}
        {/* Engine pods — 4 total with intake rings */}
        {[[5.5,0.5,-0.9],[9.8,2.2,0.85]].map(([cx,cy,iy])=>(
          <g key={cx}>
            <ellipse cx={cx*w}  cy={cy} rx={1.2*w} ry="2.05" fill={color} opacity=".95"/>
            <ellipse cx={cx*w}  cy={iy} rx={1.0*w} ry="0.44" fill="#010512" opacity=".52"/>
            <ellipse cx={-cx*w} cy={cy} rx={1.2*w} ry="2.05" fill={color} opacity=".95"/>
            <ellipse cx={-cx*w} cy={iy} rx={1.0*w} ry="0.44" fill="#010512" opacity=".52"/>
          </g>
        ))}
      </>);
    }

    case 'military': {
      // F-22 Raptor — traced from reference silhouette
      // Stepped chine LE, 42° wing sweep, large stabs, twin rectangular nozzle boxes
      const w = Math.max(0.28, f);
      return (<>
        {/* Main body — two-step chine, broad wing, large stabs, nozzle boxes */}
        <polygon points={`
          0,-12
          ${1.1*w},-10.2 ${2.4*w},-7.8 ${3.8*w},-5.5
          ${13*w},4.2 ${12.6*w},5.2
          ${9.2*w},5.8 ${10*w},7.2 ${9.8*w},9.6
          ${5.2*w},9.2 ${3.2*w},9.8
          ${3.2*w},12.2 ${1.1*w},12.2 ${1.1*w},9.8
          ${-1.1*w},9.8 ${-1.1*w},12.2 ${-3.2*w},12.2
          ${-3.2*w},9.8 ${-5.2*w},9.2
          ${-9.8*w},9.6 ${-10*w},7.2 ${-9.2*w},5.8
          ${-12.6*w},5.2 ${-13*w},4.2
          ${-3.8*w},-5.5 ${-2.4*w},-7.8 ${-1.1*w},-10.2
        `} fill={color} opacity="0.96"/>
        {/* Chine facet lines — mark the stepped LE angle breaks */}
        <line x1={1.1*w} y1="-10.2" x2={2.4*w} y2="-7.8" stroke="#010a18" strokeWidth="0.6" opacity="0.38"/>
        <line x1={2.4*w} y1="-7.8"  x2={3.8*w} y2="-5.5" stroke="#010a18" strokeWidth="0.6" opacity="0.38"/>
        <line x1={-1.1*w} y1="-10.2" x2={-2.4*w} y2="-7.8" stroke="#010a18" strokeWidth="0.6" opacity="0.38"/>
        <line x1={-2.4*w} y1="-7.8"  x2={-3.8*w} y2="-5.5" stroke="#010a18" strokeWidth="0.6" opacity="0.38"/>
        {/* Cockpit — long narrow teardrop on forward fuselage */}
        <ellipse cx="0" cy="-9" rx={0.95*w} ry="2.6" fill="#010a18" opacity="0.44"/>
        {/* Gap between twin nozzle boxes */}
        <rect x={-1.1*w} y="9.8" width={2.2*w} height="2.4" rx="0.2" fill="#010a18" opacity="0.48"/>
      </>);
    }

    case 'piston': {
      // C172/C182 — narrow nose, long tapering empennage, thin H-stab
      // Wings: straight LE (nearly perpendicular), tapered TE, foreshortened by fc
      const hw  = Math.max(1.2, 11.2 * Math.max(fc, 0.38)); // half wingspan
      const ht  = Math.max(1.0, hw * 0.40);                  // half stab-span
      return (<>
        {/* ── Fuselage: narrow nose curves into wider cabin, long tail taper ── */}
        <path d={`M0,-11.5
          C${1.0},-11 ${1.8},-10.2 ${2.0},-9
          C${2.3},-7.8 ${2.6},-6.5 ${2.7},-5.5
          L${2.7},1.5
          C${2.7},2.8 ${2.2},4.5 ${1.8},6.2
          C${1.4},7.6 ${1.0},8.8 ${0.8},10
          L0,10.4
          L${-0.8},10
          C${-1.0},8.8 ${-1.4},7.6 ${-1.8},6.2
          C${-2.2},4.5 ${-2.7},2.8 ${-2.7},1.5
          L${-2.7},-5.5
          C${-2.6},-6.5 ${-2.3},-7.8 ${-2.0},-9
          C${-1.8},-10.2 ${-1.0},-11 0,-11.5Z`}
          fill={color}/>
        {/* ── Wings: straight LE, tapered toward tip ── */}
        <polygon points={`-2.6,-2.0 ${-hw},-2.3 ${-hw},1.2 -2.6,3.0`} fill={color}/>
        <ellipse cx={-hw} cy={-0.55} rx="0.78" ry="1.75" fill={color}/>
        <polygon points={`2.6,-2.0 ${hw},-2.3 ${hw},1.2 2.6,3.0`} fill={color}/>
        <ellipse cx={hw}  cy={-0.55} rx="0.78" ry="1.75" fill={color}/>
        {/* ── High-wing strut hints ── */}
        <line x1="-2.6" y1="0.5" x2={-hw*0.8} y2="0.3"
          stroke={color} strokeWidth="0.55" opacity="0.28"/>
        <line x1="2.6"  y1="0.5" x2={hw*0.8}  y2="0.3"
          stroke={color} strokeWidth="0.55" opacity="0.28"/>
        {/* ── H-stab: thin rect + rounded tips ── */}
        <rect x={-ht} y="9.5" width={ht*2} height="0.85" rx="0.42" fill={color}/>
        <ellipse cx={-ht} cy="9.92" rx="0.52" ry="0.88" fill={color}/>
        <ellipse cx={ht}  cy="9.92" rx="0.52" ry="0.88" fill={color}/>
        {/* ── Prop + hub ── */}
        <line x1="-3.4" y1="-9.0" x2="3.4" y2="-9.0"
          stroke={color} strokeWidth="1.9" strokeLinecap="round"/>
        <circle cx="0" cy="-9.0" r="1.1" fill={color}/>
      </>);
    }

    case 'helicopter': {
      // Top-down helicopter: main rotor disc + fuselage + tail boom + tail rotor
      return (<>
        {/* Main rotor blades — 4-blade, no foreshortening (rotor is always overhead) */}
        <line x1="0" y1="-11" x2="0" y2="11" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.9"/>
        <line x1="-11" y1="0" x2="11" y2="0" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.9"/>
        {/* Diagonal blades (offset 45°) */}
        <line x1="-7.8" y1="-7.8" x2="7.8" y2="7.8" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
        <line x1="7.8" y1="-7.8" x2="-7.8" y2="7.8" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
        {/* Rotor hub */}
        <circle cx="0" cy="0" r="2" fill={color} opacity="0.95"/>
        {/* Fuselage — wide oval, nose forward (-y) */}
        <ellipse cx="0" cy="1" rx="3.2" ry="5.5" fill={color} opacity="0.92"/>
        {/* Cockpit bubble */}
        <ellipse cx="0" cy="-2" rx="3.5" ry="3.2" fill={color} opacity="0.55"/>
        {/* Tail boom — narrow tube aft */}
        <rect x="-1.0" y="6.5" width="2.0" height="5.5" rx="0.8" fill={color} opacity="0.88"/>
        {/* Tail rotor — perpendicular at boom tip */}
        <line x1="-3.5" y1="11.2" x2="3.5" y2="11.2" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.9"/>
        <circle cx="0" cy="11.2" r="0.9" fill={color}/>
        {/* Skids — landing gear lines */}
        <line x1="-4" y1="1" x2="-4" y2="4.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.45"/>
        <line x1="4"  y1="1" x2="4"  y2="4.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.45"/>
        <line x1="-5" y1="4.5" x2="-1" y2="4.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.45"/>
        <line x1="5"  y1="4.5" x2="1"  y2="4.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.45"/>
      </>);
    }

    default: {
      // Narrowbody — B737 style
      // Slimmer fuselage, engines closer to body, thinner tapered wings
      const w = Math.max(0.38, f);
      return (<>
        {/* Slim fuselage — rx 1.5 (was 1.55), smooth nose taper */}
        <path d={`M0,-10.8
          C${1.2},-10.4 ${1.5},-9.5 ${1.5},-8
          L${1.5},-2.8
          C${4.8},-1.5 ${8.5*w},.4 ${11*w},2.4
          Q${11.8*w},3.2 ${11*w},4.2
          C${8.8*w},4.4 ${5.5*w},3.2 ${2.2},2.5
          L${2},7
          C${3.5},7 ${5.5},6.8 ${5.9},7.7
          L${6.2},8.8
          Q${5},9.2 0,9.3
          Q${-5},9.2 ${-6.2},8.8
          L${-5.9},7.7
          C${-5.5},6.8 ${-3.5},7 ${-2},7
          L${-2.2},2.5
          C${-5.5*w},3.2 ${-8.8*w},4.4 ${-11*w},4.2
          Q${-11.8*w},3.2 ${-11*w},2.4
          C${-8.5*w},.4 ${-4.8},-1.5 ${-1.5},-2.8
          L${-1.5},-8
          C${-1.5},-9.5 ${-1.2},-10.4 0,-10.8Z`}
          fill={color}/>
        {/* Wings: thinner chord (root 3.4, tip 1.4), more taper */}
        <polygon points={`-1.5,-2.2 ${-12*w},1.2 ${-11.5*w},2.6 -1.5,1.2`} fill={color}/>
        <ellipse cx={-12*w} cy="1.9" rx="0.6" ry="0.85" fill={color}/>
        <polygon points={`1.5,-2.2 ${12*w},1.2 ${11.5*w},2.6 1.5,1.2`} fill={color}/>
        <ellipse cx={12*w} cy="1.9" rx="0.6" ry="0.85" fill={color}/>
        {/* Engines: closer in (cx ±5 vs old ±6.5), clear intake ring */}
        <ellipse cx={-5*w} cy="1.5" rx={1.35*w} ry={2.4*w} fill={color} opacity="0.95"/>
        <ellipse cx={-5*w} cy={0.1} rx={1.05*w} ry={0.5*w} fill="#010512" opacity="0.55"/>
        <ellipse cx={ 5*w} cy="1.5" rx={1.35*w} ry={2.4*w} fill={color} opacity="0.95"/>
        <ellipse cx={ 5*w} cy={0.1} rx={1.05*w} ry={0.5*w} fill="#010512" opacity="0.55"/>
      </>);
    }
  }
};


const MOCK = [
  {id:'AAL194', cs:'AAL194', airline:'American Airlines',  lat:39.52, lon:-76.18, alt:11200, spd:245, hdg:75,  type:'B738'},
  {id:'UAL872', cs:'UAL872', airline:'United Airlines',    lat:40.08, lon:-77.92, alt:10700, spd:238, hdg:270, type:'B77W'},
  {id:'DAL441', cs:'DAL441', airline:'Delta Air Lines',    lat:38.12, lon:-75.82, alt:9100,  spd:231, hdg:140, type:'A321'},
  {id:'SWA2210',cs:'SWA2210',airline:'Southwest Airlines', lat:37.82, lon:-78.48, alt:7600,  spd:225, hdg:220, type:'B737'},
  {id:'BAW266', cs:'BAW266', airline:'British Airways',    lat:39.88, lon:-75.41, alt:12100, spd:260, hdg:90,  type:'B789'},
  {id:'DLH421', cs:'DLH421', airline:'Lufthansa',          lat:38.51, lon:-76.03, alt:11800, spd:255, hdg:350, type:'A350'},
  {id:'FFT327', cs:'FFT327', airline:'Frontier Airlines',  lat:38.21, lon:-77.82, alt:8200,  spd:220, hdg:185, type:'A320'},
  {id:'UAE210', cs:'UAE210', airline:'Emirates',           lat:40.28, lon:-76.81, alt:12800, spd:268, hdg:30,  type:'A388'},
  {id:'AFR062', cs:'AFR062', airline:'Air France',         lat:39.62, lon:-78.61, alt:11500, spd:252, hdg:315, type:'B77W'},
  {id:'SKW5522',cs:'SKW5522',airline:'SkyWest Airlines',   lat:37.52, lon:-77.21, alt:5800,  spd:195, hdg:160, type:'CRJ2'},
  {id:'FDX1191',cs:'FDX1191',airline:'FedEx Express',      lat:38.72, lon:-79.12, alt:9800,  spd:242, hdg:265, type:'B763'},
  {id:'JBU514', cs:'JBU514', airline:'JetBlue Airways',    lat:39.28, lon:-75.12, alt:10200, spd:235, hdg:95,  type:'A321'},
  {id:'WJA331', cs:'WJA331', airline:'WestJet',            lat:40.52, lon:-77.38, alt:11000, spd:248, hdg:340, type:'B737'},
  {id:'ASA621', cs:'ASA621', airline:'Alaska Airlines',    lat:38.28, lon:-75.52, alt:9400,  spd:233, hdg:120, type:'B738'},
  // Military demo traffic (Dover AFB / Andrews area)
  {id:'RCH291', cs:'RCH291', airline:'USAF',               lat:38.61, lon:-76.44, alt:7600,  spd:230, hdg:260, type:'C17'},
  {id:'HAWK01', cs:'HAWK01', airline:'USAF',               lat:38.82, lon:-77.12, alt:4900,  spd:380, hdg:170, type:'F16'},
];

const CITIES = [
  {name:'New York',st:'NY',lat:40.7128,lon:-74.006},
  {name:'Yonkers',st:'NY',lat:40.9312,lon:-73.8988},
  {name:'Buffalo',st:'NY',lat:42.8864,lon:-78.8784},
  {name:'Rochester',st:'NY',lat:43.1566,lon:-77.6088},
  {name:'Syracuse',st:'NY',lat:43.0481,lon:-76.1474},
  {name:'Albany',st:'NY',lat:42.6526,lon:-73.7562},
  {name:'New Haven',st:'CT',lat:41.3082,lon:-72.9279},
  {name:'Hartford',st:'CT',lat:41.7658,lon:-72.6851},
  {name:'Bridgeport',st:'CT',lat:41.1865,lon:-73.1952},
  {name:'Stamford',st:'CT',lat:41.0534,lon:-73.5387},
  {name:'Worcester',st:'MA',lat:42.2626,lon:-71.8023},
  {name:'Boston',st:'MA',lat:42.3601,lon:-71.0589},
  {name:'Springfield',st:'MA',lat:42.1015,lon:-72.5898},
  {name:'Providence',st:'RI',lat:41.824,lon:-71.4128},
  {name:'Manchester',st:'NH',lat:42.9956,lon:-71.4548},
  {name:'Portland',st:'ME',lat:43.6591,lon:-70.2568},
  {name:'Philadelphia',st:'PA',lat:39.9526,lon:-75.1652},
  {name:'Pittsburgh',st:'PA',lat:40.4406,lon:-79.9959},
  {name:'Allentown',st:'PA',lat:40.6084,lon:-75.4902},
  {name:'Reading',st:'PA',lat:40.3356,lon:-75.9269},
  {name:'Erie',st:'PA',lat:42.1292,lon:-80.0851},
  {name:'Scranton',st:'PA',lat:41.409,lon:-75.6624},
  {name:'Newark',st:'NJ',lat:40.7357,lon:-74.1724},
  {name:'Jersey City',st:'NJ',lat:40.7178,lon:-74.0431},
  {name:'Paterson',st:'NJ',lat:40.9176,lon:-74.1719},
  {name:'Elizabeth',st:'NJ',lat:40.664,lon:-74.2107},
  {name:'Trenton',st:'NJ',lat:40.2171,lon:-74.7429},
  {name:'Baltimore',st:'MD',lat:39.2904,lon:-76.6122},
  {name:'Washington',st:'DC',lat:38.9072,lon:-77.0369},
  {name:'Alexandria',st:'VA',lat:38.8048,lon:-77.0469},
  {name:'Wilmington',st:'DE',lat:39.7447,lon:-75.5484},
  {name:'Virginia Beach',st:'VA',lat:36.8529,lon:-75.978},
  {name:'Norfolk',st:'VA',lat:36.8508,lon:-76.2859},
  {name:'Chesapeake',st:'VA',lat:36.7682,lon:-76.2875},
  {name:'Richmond',st:'VA',lat:37.5407,lon:-77.436},
  {name:'Hampton',st:'VA',lat:37.0299,lon:-76.3452},
  {name:'Newport News',st:'VA',lat:37.0871,lon:-76.473},
  {name:'Charlotte',st:'NC',lat:35.2271,lon:-80.8431},
  {name:'Raleigh',st:'NC',lat:35.7796,lon:-78.6382},
  {name:'Greensboro',st:'NC',lat:36.0726,lon:-79.792},
  {name:'Durham',st:'NC',lat:35.994,lon:-78.8986},
  {name:'Winston-Salem',st:'NC',lat:36.0999,lon:-80.2442},
  {name:'Fayetteville',st:'NC',lat:35.0527,lon:-78.8784},
  {name:'Cary',st:'NC',lat:35.7915,lon:-78.7811},
  {name:'Atlanta',st:'GA',lat:33.749,lon:-84.388},
  {name:'Columbus',st:'GA',lat:32.461,lon:-84.9877},
  {name:'Augusta',st:'GA',lat:33.4735,lon:-82.0105},
  {name:'Savannah',st:'GA',lat:32.0809,lon:-81.0912},
  {name:'Macon',st:'GA',lat:32.8407,lon:-83.6324},
  {name:'Jacksonville',st:'FL',lat:30.3322,lon:-81.6557},
  {name:'Miami',st:'FL',lat:25.7617,lon:-80.1918},
  {name:'Tampa',st:'FL',lat:27.9506,lon:-82.4572},
  {name:'Orlando',st:'FL',lat:28.5383,lon:-81.3792},
  {name:'St. Petersburg',st:'FL',lat:27.7676,lon:-82.6403},
  {name:'Hialeah',st:'FL',lat:25.8576,lon:-80.2781},
  {name:'Tallahassee',st:'FL',lat:30.4518,lon:-84.2807},
  {name:'Fort Lauderdale',st:'FL',lat:26.1224,lon:-80.1373},
  {name:'Cape Coral',st:'FL',lat:26.5629,lon:-81.9495},
  {name:'Coral Springs',st:'FL',lat:26.2709,lon:-80.2706},
  {name:'Hollywood',st:'FL',lat:26.0112,lon:-80.1495},
  {name:'Gainesville',st:'FL',lat:29.6516,lon:-82.3248},
  {name:'Clearwater',st:'FL',lat:27.9659,lon:-82.8001},
  {name:'Lakeland',st:'FL',lat:28.0395,lon:-81.9498},
  {name:'Pompano Beach',st:'FL',lat:26.2379,lon:-80.1248},
  {name:'West Palm Beach',st:'FL',lat:26.7153,lon:-80.0534},
  {name:'Nashville',st:'TN',lat:36.1627,lon:-86.7816},
  {name:'Memphis',st:'TN',lat:35.1495,lon:-90.049},
  {name:'Knoxville',st:'TN',lat:35.9606,lon:-83.9207},
  {name:'Chattanooga',st:'TN',lat:35.0456,lon:-85.3097},
  {name:'Clarksville',st:'TN',lat:36.5298,lon:-87.3595},
  {name:'Murfreesboro',st:'TN',lat:35.8456,lon:-86.3903},
  {name:'Louisville',st:'KY',lat:38.2527,lon:-85.7585},
  {name:'Lexington',st:'KY',lat:38.0406,lon:-84.5037},
  {name:'Birmingham',st:'AL',lat:33.5186,lon:-86.8104},
  {name:'Montgomery',st:'AL',lat:32.3668,lon:-86.2999},
  {name:'Huntsville',st:'AL',lat:34.7304,lon:-86.5861},
  {name:'Mobile',st:'AL',lat:30.6954,lon:-88.0399},
  {name:'Jackson',st:'MS',lat:32.2988,lon:-90.1848},
  {name:'Baton Rouge',st:'LA',lat:30.4515,lon:-91.1871},
  {name:'New Orleans',st:'LA',lat:29.9511,lon:-90.0715},
  {name:'Shreveport',st:'LA',lat:32.5252,lon:-93.7502},
  {name:'Little Rock',st:'AR',lat:34.7465,lon:-92.2896},
  {name:'Chicago',st:'IL',lat:41.8781,lon:-87.6298},
  {name:'Rockford',st:'IL',lat:42.2711,lon:-89.094},
  {name:'Joliet',st:'IL',lat:41.525,lon:-88.0817},
  {name:'Naperville',st:'IL',lat:41.7508,lon:-88.1535},
  {name:'Peoria',st:'IL',lat:40.6936,lon:-89.589},
  {name:'Elgin',st:'IL',lat:42.0354,lon:-88.2826},
  {name:'Indianapolis',st:'IN',lat:39.7684,lon:-86.1581},
  {name:'Fort Wayne',st:'IN',lat:41.0793,lon:-85.1394},
  {name:'South Bend',st:'IN',lat:41.6764,lon:-86.252},
  {name:'Evansville',st:'IN',lat:37.9716,lon:-87.5711},
  {name:'Columbus',st:'OH',lat:39.9612,lon:-82.9988},
  {name:'Cleveland',st:'OH',lat:41.4993,lon:-81.6944},
  {name:'Cincinnati',st:'OH',lat:39.1031,lon:-84.512},
  {name:'Toledo',st:'OH',lat:41.6639,lon:-83.5552},
  {name:'Akron',st:'OH',lat:41.0814,lon:-81.519},
  {name:'Dayton',st:'OH',lat:39.7589,lon:-84.1916},
  {name:'Detroit',st:'MI',lat:42.3314,lon:-83.0458},
  {name:'Grand Rapids',st:'MI',lat:42.9634,lon:-85.6681},
  {name:'Warren',st:'MI',lat:42.5145,lon:-83.0146},
  {name:'Sterling Heights',st:'MI',lat:42.5803,lon:-83.0302},
  {name:'Lansing',st:'MI',lat:42.7325,lon:-84.5555},
  {name:'Ann Arbor',st:'MI',lat:42.2808,lon:-83.743},
  {name:'Flint',st:'MI',lat:43.0125,lon:-83.6875},
  {name:'Minneapolis',st:'MN',lat:44.9778,lon:-93.265},
  {name:'St. Paul',st:'MN',lat:44.9537,lon:-93.09},
  {name:'Rochester',st:'MN',lat:44.0121,lon:-92.4802},
  {name:'Milwaukee',st:'WI',lat:43.0389,lon:-87.9065},
  {name:'Madison',st:'WI',lat:43.0731,lon:-89.4012},
  {name:'Green Bay',st:'WI',lat:44.5133,lon:-88.0133},
  {name:'Kenosha',st:'WI',lat:42.5847,lon:-87.8212},
  {name:'Kansas City',st:'MO',lat:39.0997,lon:-94.5786},
  {name:'St. Louis',st:'MO',lat:38.627,lon:-90.1994},
  {name:'Springfield',st:'MO',lat:37.2153,lon:-93.2982},
  {name:'Independence',st:'MO',lat:39.0911,lon:-94.4155},
  {name:'Omaha',st:'NE',lat:41.2565,lon:-95.9345},
  {name:'Lincoln',st:'NE',lat:40.8136,lon:-96.7026},
  {name:'Wichita',st:'KS',lat:37.6872,lon:-97.3301},
  {name:'Overland Park',st:'KS',lat:38.9822,lon:-94.6708},
  {name:'Kansas City',st:'KS',lat:39.1142,lon:-94.6275},
  {name:'Topeka',st:'KS',lat:39.0558,lon:-95.689},
  {name:'Des Moines',st:'IA',lat:41.5868,lon:-93.625},
  {name:'Cedar Rapids',st:'IA',lat:41.9779,lon:-91.6656},
  {name:'Sioux Falls',st:'SD',lat:43.5446,lon:-96.7311},
  {name:'Fargo',st:'ND',lat:46.8772,lon:-96.7898},
  {name:'Houston',st:'TX',lat:29.7604,lon:-95.3698},
  {name:'San Antonio',st:'TX',lat:29.4241,lon:-98.4936},
  {name:'Dallas',st:'TX',lat:32.7767,lon:-96.797},
  {name:'Austin',st:'TX',lat:30.2672,lon:-97.7431},
  {name:'Fort Worth',st:'TX',lat:32.7555,lon:-97.3308},
  {name:'El Paso',st:'TX',lat:31.7619,lon:-106.485},
  {name:'Arlington',st:'TX',lat:32.7357,lon:-97.1081},
  {name:'Corpus Christi',st:'TX',lat:27.8006,lon:-97.3964},
  {name:'Plano',st:'TX',lat:33.0198,lon:-96.6989},
  {name:'Laredo',st:'TX',lat:27.5306,lon:-99.4803},
  {name:'Lubbock',st:'TX',lat:33.5779,lon:-101.8552},
  {name:'Garland',st:'TX',lat:32.9126,lon:-96.6389},
  {name:'Irving',st:'TX',lat:32.814,lon:-96.9489},
  {name:'Amarillo',st:'TX',lat:35.222,lon:-101.8313},
  {name:'McKinney',st:'TX',lat:33.1972,lon:-96.6397},
  {name:'Frisco',st:'TX',lat:33.1584,lon:-96.8236},
  {name:'Grand Prairie',st:'TX',lat:32.746,lon:-97.0208},
  {name:'Brownsville',st:'TX',lat:25.9018,lon:-97.4975},
  {name:'Pasadena',st:'TX',lat:29.6911,lon:-95.2091},
  {name:'Killeen',st:'TX',lat:31.1171,lon:-97.7278},
  {name:'McAllen',st:'TX',lat:26.2034,lon:-98.23},
  {name:'Mesquite',st:'TX',lat:32.7668,lon:-96.5992},
  {name:'Waco',st:'TX',lat:31.5493,lon:-97.1467},
  {name:'Denton',st:'TX',lat:33.2148,lon:-97.1331},
  {name:'Midland',st:'TX',lat:31.9974,lon:-102.0779},
  {name:'Abilene',st:'TX',lat:32.4487,lon:-99.7331},
  {name:'Beaumont',st:'TX',lat:30.0802,lon:-94.1266},
  {name:'Carrollton',st:'TX',lat:32.9537,lon:-96.8903},
  {name:'Round Rock',st:'TX',lat:30.5083,lon:-97.6789},
  {name:'Odessa',st:'TX',lat:31.8457,lon:-102.3676},
  {name:'Port Arthur',st:'TX',lat:29.8849,lon:-93.9399},
  {name:'Lewisville',st:'TX',lat:33.0462,lon:-96.9942},
  {name:'Richardson',st:'TX',lat:32.9483,lon:-96.7299},
  {name:'Tyler',st:'TX',lat:32.3513,lon:-95.301},
  {name:'Oklahoma City',st:'OK',lat:35.4676,lon:-97.5164},
  {name:'Tulsa',st:'OK',lat:36.154,lon:-95.9928},
  {name:'Norman',st:'OK',lat:35.2226,lon:-97.4395},
  {name:'Broken Arrow',st:'OK',lat:36.0526,lon:-95.7908},
  {name:'Columbia',st:'SC',lat:34.0007,lon:-81.0348},
  {name:'North Charleston',st:'SC',lat:32.8546,lon:-79.9748},
  {name:'Los Angeles',st:'CA',lat:34.0522,lon:-118.2437},
  {name:'San Diego',st:'CA',lat:32.7157,lon:-117.1611},
  {name:'San Jose',st:'CA',lat:37.3382,lon:-121.8863},
  {name:'San Francisco',st:'CA',lat:37.7749,lon:-122.4194},
  {name:'Fresno',st:'CA',lat:36.7378,lon:-119.7871},
  {name:'Sacramento',st:'CA',lat:38.5816,lon:-121.4944},
  {name:'Long Beach',st:'CA',lat:33.7701,lon:-118.1937},
  {name:'Oakland',st:'CA',lat:37.8044,lon:-122.2712},
  {name:'Bakersfield',st:'CA',lat:35.3733,lon:-119.0187},
  {name:'Anaheim',st:'CA',lat:33.8366,lon:-117.9143},
  {name:'Santa Ana',st:'CA',lat:33.7455,lon:-117.8677},
  {name:'Riverside',st:'CA',lat:33.9806,lon:-117.3755},
  {name:'Stockton',st:'CA',lat:37.9577,lon:-121.2908},
  {name:'Irvine',st:'CA',lat:33.6846,lon:-117.8265},
  {name:'Chula Vista',st:'CA',lat:32.6401,lon:-117.0842},
  {name:'Fremont',st:'CA',lat:37.5485,lon:-121.9886},
  {name:'San Bernardino',st:'CA',lat:34.1083,lon:-117.2898},
  {name:'Modesto',st:'CA',lat:37.6391,lon:-120.9969},
  {name:'Fontana',st:'CA',lat:34.0922,lon:-117.435},
  {name:'Moreno Valley',st:'CA',lat:33.9375,lon:-117.2306},
  {name:'Glendale',st:'CA',lat:34.1425,lon:-118.2551},
  {name:'Huntington Beach',st:'CA',lat:33.6595,lon:-117.9988},
  {name:'Santa Rosa',st:'CA',lat:38.4404,lon:-122.7141},
  {name:'Garden Grove',st:'CA',lat:33.7743,lon:-117.9378},
  {name:'Oceanside',st:'CA',lat:33.1959,lon:-117.3795},
  {name:'Rancho Cucamonga',st:'CA',lat:34.1064,lon:-117.5931},
  {name:'Ontario',st:'CA',lat:34.0633,lon:-117.6509},
  {name:'Corona',st:'CA',lat:33.8753,lon:-117.5664},
  {name:'Lancaster',st:'CA',lat:34.6868,lon:-118.1542},
  {name:'Palmdale',st:'CA',lat:34.5794,lon:-118.1165},
  {name:'Pomona',st:'CA',lat:34.0553,lon:-117.75},
  {name:'Torrance',st:'CA',lat:33.8358,lon:-118.3406},
  {name:'El Monte',st:'CA',lat:34.0686,lon:-118.0276},
  {name:'Sunnyvale',st:'CA',lat:37.3688,lon:-122.0363},
  {name:'Escondido',st:'CA',lat:33.1192,lon:-117.0864},
  {name:'Salinas',st:'CA',lat:36.6777,lon:-121.6555},
  {name:'Thousand Oaks',st:'CA',lat:34.1706,lon:-118.8376},
  {name:'Simi Valley',st:'CA',lat:34.2694,lon:-118.7815},
  {name:'Visalia',st:'CA',lat:36.3302,lon:-119.2921},
  {name:'Concord',st:'CA',lat:37.978,lon:-122.0311},
  {name:'Roseville',st:'CA',lat:38.7521,lon:-121.288},
  {name:'Hayward',st:'CA',lat:37.6688,lon:-122.0808},
  {name:'Victorville',st:'CA',lat:34.5362,lon:-117.2928},
  {name:'Berkeley',st:'CA',lat:37.8716,lon:-122.2727},
  {name:'Costa Mesa',st:'CA',lat:33.6411,lon:-117.9187},
  {name:'Inglewood',st:'CA',lat:33.9617,lon:-118.3531},
  {name:'Santa Clarita',st:'CA',lat:34.3917,lon:-118.5426},
  {name:'Fullerton',st:'CA',lat:33.8703,lon:-117.9242},
  {name:'Murrieta',st:'CA',lat:33.5539,lon:-117.2139},
  {name:'Temecula',st:'CA',lat:33.4936,lon:-117.1484},
  {name:'El Cajon',st:'CA',lat:32.7948,lon:-116.9625},
  {name:'Oxnard',st:'CA',lat:34.1975,lon:-119.1771},
  {name:'Orange',st:'CA',lat:33.7879,lon:-117.8531},
  {name:'Elk Grove',st:'CA',lat:38.4088,lon:-121.3716},
  {name:'Santa Clara',st:'CA',lat:37.3541,lon:-121.9552},
  {name:'Pasadena',st:'CA',lat:34.1478,lon:-118.1445},
  {name:'West Covina',st:'CA',lat:34.0686,lon:-117.939},
  {name:'Vallejo',st:'CA',lat:38.1041,lon:-122.2566},
  {name:'Rialto',st:'CA',lat:34.1064,lon:-117.3703},
  {name:'Peoria',st:'AZ',lat:33.5806,lon:-112.2374},
  {name:'Phoenix',st:'AZ',lat:33.4484,lon:-112.074},
  {name:'Tucson',st:'AZ',lat:32.2226,lon:-110.9747},
  {name:'Mesa',st:'AZ',lat:33.4152,lon:-111.8315},
  {name:'Chandler',st:'AZ',lat:33.3062,lon:-111.8413},
  {name:'Scottsdale',st:'AZ',lat:33.4942,lon:-111.9261},
  {name:'Gilbert',st:'AZ',lat:33.3528,lon:-111.789},
  {name:'Glendale',st:'AZ',lat:33.5387,lon:-112.186},
  {name:'Tempe',st:'AZ',lat:33.4255,lon:-111.94},
  {name:'Surprise',st:'AZ',lat:33.6292,lon:-112.3679},
  {name:'Goodyear',st:'AZ',lat:33.4353,lon:-112.3576},
  {name:'Avondale',st:'AZ',lat:33.4356,lon:-112.3496},
  {name:'Las Vegas',st:'NV',lat:36.1699,lon:-115.1398},
  {name:'Henderson',st:'NV',lat:36.0395,lon:-114.9817},
  {name:'Reno',st:'NV',lat:39.5296,lon:-119.8138},
  {name:'North Las Vegas',st:'NV',lat:36.1989,lon:-115.1175},
  {name:'Paradise',st:'NV',lat:36.0948,lon:-115.1399},
  {name:'Denver',st:'CO',lat:39.7392,lon:-104.9903},
  {name:'Colorado Springs',st:'CO',lat:38.8339,lon:-104.8214},
  {name:'Aurora',st:'CO',lat:39.7294,lon:-104.8319},
  {name:'Fort Collins',st:'CO',lat:40.5853,lon:-105.0844},
  {name:'Lakewood',st:'CO',lat:39.7047,lon:-105.0814},
  {name:'Thornton',st:'CO',lat:39.8683,lon:-104.9719},
  {name:'Pueblo',st:'CO',lat:38.2544,lon:-104.6091},
  {name:'Arvada',st:'CO',lat:39.8028,lon:-105.0875},
  {name:'Westminster',st:'CO',lat:39.8367,lon:-105.0372},
  {name:'Salt Lake City',st:'UT',lat:40.7608,lon:-111.891},
  {name:'West Valley City',st:'UT',lat:40.6916,lon:-112.001},
  {name:'Provo',st:'UT',lat:40.2338,lon:-111.6585},
  {name:'West Jordan',st:'UT',lat:40.6097,lon:-111.9391},
  {name:'Orem',st:'UT',lat:40.2969,lon:-111.6946},
  {name:'Ogden',st:'UT',lat:41.223,lon:-111.9738},
  {name:'St. George',st:'UT',lat:37.1041,lon:-113.5841},
  {name:'Albuquerque',st:'NM',lat:35.0844,lon:-106.6504},
  {name:'Las Cruces',st:'NM',lat:32.3199,lon:-106.7637},
  {name:'Rio Rancho',st:'NM',lat:35.2328,lon:-106.663},
  {name:'Seattle',st:'WA',lat:47.6062,lon:-122.3321},
  {name:'Spokane',st:'WA',lat:47.6588,lon:-117.426},
  {name:'Tacoma',st:'WA',lat:47.2529,lon:-122.4443},
  {name:'Vancouver',st:'WA',lat:45.6387,lon:-122.6615},
  {name:'Bellevue',st:'WA',lat:47.6101,lon:-122.2015},
  {name:'Kent',st:'WA',lat:47.3809,lon:-122.2348},
  {name:'Renton',st:'WA',lat:47.4829,lon:-122.2171},
  {name:'Kirkland',st:'WA',lat:47.6815,lon:-122.2087},
  {name:'Spokane Valley',st:'WA',lat:47.6732,lon:-117.2394},
  {name:'Federal Way',st:'WA',lat:47.3223,lon:-122.3126},
  {name:'Portland',st:'OR',lat:45.5051,lon:-122.675},
  {name:'Eugene',st:'OR',lat:44.0521,lon:-123.0868},
  {name:'Salem',st:'OR',lat:44.9429,lon:-123.0351},
  {name:'Gresham',st:'OR',lat:45.4929,lon:-122.4286},
  {name:'Hillsboro',st:'OR',lat:45.5229,lon:-122.9898},
  {name:'Beaverton',st:'OR',lat:45.4871,lon:-122.8037},
  {name:'Anchorage',st:'AK',lat:61.2181,lon:-149.9003},
  {name:'Honolulu',st:'HI',lat:21.3069,lon:-157.8583},
  {name:'East Honolulu',st:'HI',lat:21.289,lon:-157.733},
  {name:'Billings',st:'MT',lat:45.7833,lon:-108.5007},
  {name:'Boise',st:'ID',lat:43.6187,lon:-116.2146},
  {name:'Nampa',st:'ID',lat:43.5407,lon:-116.5635},
  {name:'Toronto',st:'ON',lat:43.6532,lon:-79.3832},
  {name:'Montreal',st:'QC',lat:45.5017,lon:-73.5673},
  {name:'Vancouver',st:'BC',lat:49.2827,lon:-123.1207},
  {name:'Calgary',st:'AB',lat:51.0447,lon:-114.0719},
  {name:'Edmonton',st:'AB',lat:53.5461,lon:-113.4938},
  {name:'Ottawa',st:'ON',lat:45.4215,lon:-75.6972},
  {name:'Winnipeg',st:'MB',lat:49.8951,lon:-97.1384},
  {name:'Quebec City',st:'QC',lat:46.8139,lon:-71.208},
  {name:'Hamilton',st:'ON',lat:43.2557,lon:-79.8711},
  {name:'Kitchener',st:'ON',lat:43.4516,lon:-80.4925},
  {name:'London',st:'ON',lat:42.9849,lon:-81.2453},
  {name:'Halifax',st:'NS',lat:44.6488,lon:-63.5752},
  {name:'Victoria',st:'BC',lat:48.4284,lon:-123.3656},
  {name:'Windsor',st:'ON',lat:42.3149,lon:-83.0364},
  {name:'Oshawa',st:'ON',lat:43.8971,lon:-78.8658},
  {name:'Saskatoon',st:'SK',lat:52.1332,lon:-106.67},
  {name:'Regina',st:'SK',lat:50.4452,lon:-104.6189},
  {name:'Burnaby',st:'BC',lat:49.2488,lon:-122.9805},
  {name:'Surrey',st:'BC',lat:49.1913,lon:-122.849},
  {name:'Brampton',st:'ON',lat:43.7315,lon:-79.7624},
  {name:'Mississauga',st:'ON',lat:43.589,lon:-79.6441},
  {name:'Laval',st:'QC',lat:45.6066,lon:-73.7124},
  {name:'Richmond',st:'BC',lat:49.1666,lon:-123.1336},
  {name:'Longueuil',st:'QC',lat:45.5312,lon:-73.5185},
  {name:'Kelowna',st:'BC',lat:49.888,lon:-119.496},
  {name:'Abbotsford',st:'BC',lat:49.0504,lon:-122.3045},
  {name:'Coquitlam',st:'BC',lat:49.2838,lon:-122.7932},
  {name:'Barrie',st:'ON',lat:44.3894,lon:-79.6903},
  {name:'Markham',st:'ON',lat:43.8561,lon:-79.337},
  {name:'Vaughan',st:'ON',lat:43.8563,lon:-79.5085},
  {name:'Gatineau',st:'QC',lat:45.4765,lon:-75.7013},
  {name:'St. Catharines',st:'ON',lat:43.1594,lon:-79.2469},
  {name:'Cambridge',st:'ON',lat:43.3601,lon:-80.312},
  {name:'Guelph',st:'ON',lat:43.5448,lon:-80.2482},
  {name:'Whitby',st:'ON',lat:43.8975,lon:-78.9429},
  {name:'Ajax',st:'ON',lat:43.8509,lon:-79.0204},
  {name:'Thunder Bay',st:'ON',lat:48.3809,lon:-89.2477},
  {name:'Sudbury',st:'ON',lat:46.49,lon:-80.993},
  {name:'Red Deer',st:'AB',lat:52.2681,lon:-113.8112},
  {name:'Lethbridge',st:'AB',lat:49.6956,lon:-112.8451},
  {name:"St. John's",st:'NL',lat:47.5615,lon:-52.7126},
  {name:'Trois-Rivieres',st:'QC',lat:46.3432,lon:-72.5418},
  {name:'Sherbrooke',st:'QC',lat:45.4042,lon:-71.8929},
  {name:'Saguenay',st:'QC',lat:48.4278,lon:-71.058},
  {name:'Moncton',st:'NB',lat:46.1328,lon:-64.7714},
  {name:'Fredericton',st:'NB',lat:45.9636,lon:-66.6431},
  {name:'Saint John',st:'NB',lat:45.2733,lon:-66.0633},
  {name:'Mexico City',st:'MX',lat:19.4326,lon:-99.1332},
  {name:'Guadalajara',st:'MX',lat:20.6597,lon:-103.3496},
  {name:'Monterrey',st:'MX',lat:25.6866,lon:-100.3161},
  {name:'Puebla',st:'MX',lat:19.0414,lon:-98.2063},
  {name:'Tijuana',st:'MX',lat:32.5149,lon:-117.0382},
  {name:'Ciudad Juarez',st:'MX',lat:31.6904,lon:-106.4245},
  {name:'Leon',st:'MX',lat:21.1221,lon:-101.6827},
  {name:'Zapopan',st:'MX',lat:20.7202,lon:-103.3878},
  {name:'Ecatepec',st:'MX',lat:19.601,lon:-99.035},
  {name:'Guadalupe',st:'MX',lat:25.6741,lon:-100.2569},
  {name:'Merida',st:'MX',lat:20.9674,lon:-89.5926},
  {name:'Chihuahua',st:'MX',lat:28.632,lon:-106.0691},
  {name:'San Luis Potosi',st:'MX',lat:22.1565,lon:-100.9855},
  {name:'Aguascalientes',st:'MX',lat:21.8852,lon:-102.2916},
  {name:'Mexicali',st:'MX',lat:32.6245,lon:-115.4523},
  {name:'Hermosillo',st:'MX',lat:29.0729,lon:-110.9559},
  {name:'Saltillo',st:'MX',lat:25.4232,lon:-101.003},
  {name:'Morelia',st:'MX',lat:19.706,lon:-101.195},
  {name:'Culiacan',st:'MX',lat:24.7994,lon:-107.404},
  {name:'Acapulco',st:'MX',lat:16.8531,lon:-99.8237},
  {name:'Queretaro',st:'MX',lat:20.5888,lon:-100.3899},
  {name:'Torreon',st:'MX',lat:25.5428,lon:-103.4068},
  {name:'Cancun',st:'MX',lat:21.1619,lon:-86.8515},
  {name:'Mazatlan',st:'MX',lat:23.2494,lon:-106.4111},
  {name:'Reynosa',st:'MX',lat:26.08,lon:-98.2772},
  {name:'Matamoros',st:'MX',lat:25.8694,lon:-97.5042},
  {name:'Nuevo Laredo',st:'MX',lat:27.477,lon:-99.513},
  {name:'Durango',st:'MX',lat:24.0277,lon:-104.6532},
  {name:'Veracruz',st:'MX',lat:19.1738,lon:-96.1342},
  {name:'Tuxtla Gutierrez',st:'MX',lat:16.7515,lon:-93.1151},
  {name:'Tlalnepantla',st:'MX',lat:19.5433,lon:-99.2065},
  {name:'Naucalpan',st:'MX',lat:19.4771,lon:-99.2395},
  {name:'Celaya',st:'MX',lat:20.5235,lon:-100.8156},
  {name:'Xalapa',st:'MX',lat:19.5438,lon:-96.9102},
  {name:'Irapuato',st:'MX',lat:20.6742,lon:-101.3545},
  {name:'Ensenada',st:'MX',lat:31.8676,lon:-116.596},
  {name:'Oaxaca',st:'MX',lat:17.0732,lon:-96.7266},
  {name:'Pachuca',st:'MX',lat:20.1011,lon:-98.7591},
  {name:'Villahermosa',st:'MX',lat:17.9892,lon:-92.9475},
  {name:'Tepic',st:'MX',lat:21.5034,lon:-104.8956},
  {name:'Nogales',st:'MX',lat:31.3154,lon:-110.9434},
  {name:'Tapachula',st:'MX',lat:14.9054,lon:-92.2634},
  {name:'Ciudad Obregon',st:'MX',lat:27.488,lon:-109.9322},
  {name:'Coatzacoalcos',st:'MX',lat:18.1423,lon:-94.4494},

  // ── US additions 50k–75k ───────────────────────────────────────
  // Alabama
  {name:'Dothan',st:'AL',lat:31.2232,lon:-85.3905},
  {name:'Decatur',st:'AL',lat:34.6059,lon:-86.9833},
  {name:'Tuscaloosa',st:'AL',lat:33.2098,lon:-87.5692},
  {name:'Hoover',st:'AL',lat:33.4048,lon:-86.8114},
  // Arizona
  {name:'Lake Havasu City',st:'AZ',lat:34.4839,lon:-114.3224},
  {name:'Casa Grande',st:'AZ',lat:32.8795,lon:-111.7574},
  {name:'Maricopa',st:'AZ',lat:33.0581,lon:-112.0476},
  {name:'Prescott',st:'AZ',lat:34.54,lon:-112.469},
  {name:'Prescott Valley',st:'AZ',lat:34.61,lon:-112.315},
  // Arkansas
  {name:'Conway',st:'AR',lat:35.0887,lon:-92.4421},
  {name:'Bentonville',st:'AR',lat:36.3729,lon:-94.2088},
  {name:'Hot Springs',st:'AR',lat:34.5037,lon:-93.0552},
  {name:'Jonesboro',st:'AR',lat:35.8423,lon:-90.7043},
  // California
  {name:'Davis',st:'CA',lat:38.5449,lon:-121.7405},
  {name:'Redlands',st:'CA',lat:34.0556,lon:-117.1825},
  {name:'Turlock',st:'CA',lat:37.4947,lon:-120.8466},
  {name:'Rosemead',st:'CA',lat:34.0689,lon:-118.0723},
  {name:'Perris',st:'CA',lat:33.7825,lon:-117.2286},
  {name:'Hawthorne',st:'CA',lat:33.9164,lon:-118.3526},
  {name:'Compton',st:'CA',lat:33.8958,lon:-118.2201},
  {name:'Vacaville',st:'CA',lat:38.3566,lon:-121.9877},
  {name:'Citrus Heights',st:'CA',lat:38.7073,lon:-121.2808},
  {name:'Hesperia',st:'CA',lat:34.4264,lon:-117.3009},
  {name:'Livermore',st:'CA',lat:37.6819,lon:-121.768},
  {name:'Lakewood',st:'CA',lat:33.8536,lon:-118.1339},
  {name:'San Leandro',st:'CA',lat:37.7249,lon:-122.1561},
  // Colorado
  {name:'Castle Rock',st:'CO',lat:39.3722,lon:-104.8561},
  {name:'Loveland',st:'CO',lat:40.3978,lon:-105.0749},
  {name:'Parker',st:'CO',lat:39.5186,lon:-104.7614},
  {name:'Commerce City',st:'CO',lat:39.8083,lon:-104.9339},
  // Connecticut
  {name:'New Britain',st:'CT',lat:41.6612,lon:-72.7795},
  {name:'Meriden',st:'CT',lat:41.5382,lon:-72.7973},
  {name:'Hamden',st:'CT',lat:41.3959,lon:-72.8968},
  {name:'West Haven',st:'CT',lat:41.2709,lon:-72.9471},
  {name:'Bristol',st:'CT',lat:41.6718,lon:-72.9493},
  {name:'Naugatuck',st:'CT',lat:41.4851,lon:-73.0504},
  // Florida
  {name:'Deerfield Beach',st:'FL',lat:26.3184,lon:-80.0998},
  {name:'Homestead',st:'FL',lat:25.4687,lon:-80.4776},
  {name:'Boynton Beach',st:'FL',lat:26.5317,lon:-80.0905},
  {name:'Largo',st:'FL',lat:27.9095,lon:-82.7873},
  {name:'Melbourne',st:'FL',lat:28.0836,lon:-80.6081},
  {name:'Plantation',st:'FL',lat:26.1276,lon:-80.2331},
  {name:'Palm Coast',st:'FL',lat:29.5849,lon:-81.2079},
  {name:'Lauderhill',st:'FL',lat:26.1404,lon:-80.2131},
  {name:'Margate',st:'FL',lat:26.2448,lon:-80.2064},
  {name:'Daytona Beach',st:'FL',lat:29.2108,lon:-81.0228},
  // Georgia
  {name:'Johns Creek',st:'GA',lat:34.0298,lon:-84.1985},
  {name:'Albany',st:'GA',lat:31.5785,lon:-84.1557},
  {name:'Alpharetta',st:'GA',lat:34.0754,lon:-84.2941},
  {name:'Warner Robins',st:'GA',lat:32.6130,lon:-83.5996},
  {name:'Roswell',st:'GA',lat:34.0232,lon:-84.3616},
  {name:'Sandy Springs',st:'GA',lat:33.9304,lon:-84.3733},
  {name:'Peachtree City',st:'GA',lat:33.3967,lon:-84.5949},
  // Idaho
  {name:'Idaho Falls',st:'ID',lat:43.4917,lon:-112.034},
  {name:'Caldwell',st:'ID',lat:43.6629,lon:-116.6874},
  {name:'Twin Falls',st:'ID',lat:42.5629,lon:-114.4609},
  // Illinois
  {name:'Waukegan',st:'IL',lat:42.3636,lon:-87.8448},
  {name:'Cicero',st:'IL',lat:41.8456,lon:-87.7539},
  {name:'Champaign',st:'IL',lat:40.1164,lon:-88.2434},
  {name:'Bloomington',st:'IL',lat:40.4842,lon:-88.9937},
  {name:'Decatur',st:'IL',lat:39.8403,lon:-88.9548},
  {name:'Evanston',st:'IL',lat:42.0451,lon:-87.6877},
  {name:'Schaumburg',st:'IL',lat:42.0334,lon:-88.0834},
  {name:'Bolingbrook',st:'IL',lat:41.6986,lon:-88.068},
  // Indiana
  {name:'Hammond',st:'IN',lat:41.5831,lon:-87.5},
  {name:'Muncie',st:'IN',lat:40.1934,lon:-85.3864},
  {name:'Terre Haute',st:'IN',lat:39.4667,lon:-87.4139},
  {name:'Anderson',st:'IN',lat:40.1053,lon:-85.6803},
  {name:'Carmel',st:'IN',lat:39.9784,lon:-86.118},
  // Iowa
  {name:'Sioux City',st:'IA',lat:42.4999,lon:-96.4003},
  {name:'Iowa City',st:'IA',lat:41.6611,lon:-91.5302},
  {name:'Waterloo',st:'IA',lat:42.4928,lon:-92.3426},
  {name:'Ames',st:'IA',lat:42.0347,lon:-93.62},
  {name:'Dubuque',st:'IA',lat:42.5006,lon:-90.6646},
  // Kansas
  {name:'Lawrence',st:'KS',lat:38.9717,lon:-95.2353},
  {name:'Manhattan',st:'KS',lat:39.1836,lon:-96.5717},
  {name:'Salina',st:'KS',lat:38.8403,lon:-97.6114},
  // Kentucky
  {name:'Bowling Green',st:'KY',lat:36.9685,lon:-86.4808},
  {name:'Owensboro',st:'KY',lat:37.7719,lon:-87.1111},
  {name:'Covington',st:'KY',lat:39.0837,lon:-84.5086},
  // Louisiana
  {name:'Lake Charles',st:'LA',lat:30.2266,lon:-93.2174},
  {name:'Monroe',st:'LA',lat:32.5093,lon:-92.1193},
  {name:'Alexandria',st:'LA',lat:31.3113,lon:-92.4451},
  // Maine
  {name:'Lewiston',st:'ME',lat:44.1004,lon:-70.2148},
  // Maryland
  {name:'Frederick',st:'MD',lat:39.4143,lon:-77.4105},
  {name:'Rockville',st:'MD',lat:39.084,lon:-77.1528},
  {name:'Gaithersburg',st:'MD',lat:39.1434,lon:-77.2014},
  {name:'Bowie',st:'MD',lat:38.9426,lon:-76.7291},
  // Massachusetts
  {name:'Lynn',st:'MA',lat:42.4668,lon:-70.9495},
  {name:'Fall River',st:'MA',lat:41.7015,lon:-71.155},
  {name:'Newton',st:'MA',lat:42.337,lon:-71.2092},
  {name:'Somerville',st:'MA',lat:42.3876,lon:-71.0995},
  {name:'Lawrence',st:'MA',lat:42.707,lon:-71.1631},
  {name:'Waltham',st:'MA',lat:42.3765,lon:-71.2356},
  {name:'Haverhill',st:'MA',lat:42.7762,lon:-71.0773},
  {name:'Malden',st:'MA',lat:42.4251,lon:-71.0662},
  {name:'Medford',st:'MA',lat:42.4184,lon:-71.1062},
  {name:'Quincy',st:'MA',lat:42.2529,lon:-71.0023},
  // Michigan
  {name:'Kalamazoo',st:'MI',lat:42.2917,lon:-85.5872},
  {name:'Pontiac',st:'MI',lat:42.6389,lon:-83.2911},
  {name:'Westland',st:'MI',lat:42.3242,lon:-83.4002},
  {name:'Saginaw',st:'MI',lat:43.4195,lon:-83.9508},
  {name:'Battle Creek',st:'MI',lat:42.3212,lon:-85.1797},
  {name:'Muskegon',st:'MI',lat:43.2342,lon:-86.2484},
  {name:'Bay City',st:'MI',lat:43.5945,lon:-83.8888},
  // Minnesota
  {name:'Duluth',st:'MN',lat:46.7867,lon:-92.1005},
  {name:'Bloomington',st:'MN',lat:44.8408,lon:-93.3477},
  {name:'Brooklyn Park',st:'MN',lat:45.094,lon:-93.3752},
  {name:'Plymouth',st:'MN',lat:45.0105,lon:-93.4555},
  {name:'Maple Grove',st:'MN',lat:45.0724,lon:-93.4557},
  {name:'Woodbury',st:'MN',lat:44.9239,lon:-92.9591},
  {name:'Coon Rapids',st:'MN',lat:45.1197,lon:-93.3113},
  {name:'Burnsville',st:'MN',lat:44.7677,lon:-93.2777},
  {name:'Eagan',st:'MN',lat:44.8041,lon:-93.1669},
  {name:'Eden Prairie',st:'MN',lat:44.8547,lon:-93.4708},
  {name:'Minnetonka',st:'MN',lat:44.9211,lon:-93.4687},
  {name:'Apple Valley',st:'MN',lat:44.7319,lon:-93.2177},
  // Mississippi
  {name:'Gulfport',st:'MS',lat:30.3674,lon:-89.0928},
  {name:'Southaven',st:'MS',lat:34.9887,lon:-89.9928},
  {name:'Hattiesburg',st:'MS',lat:31.3271,lon:-89.2903},
  // Missouri
  {name:'St. Joseph',st:'MO',lat:39.7675,lon:-94.8467},
  {name:"Lee's Summit",st:'MO',lat:38.9108,lon:-94.3822},
  {name:"O'Fallon",st:'MO',lat:38.8106,lon:-90.6998},
  {name:'Florissant',st:'MO',lat:38.7892,lon:-90.3226},
  // Montana
  {name:'Missoula',st:'MT',lat:46.872,lon:-113.9940},
  {name:'Great Falls',st:'MT',lat:47.4942,lon:-111.2833},
  // Nebraska
  {name:'Bellevue',st:'NE',lat:41.1367,lon:-95.8945},
  {name:'Kearney',st:'NE',lat:40.6993,lon:-99.0817},
  // Nevada
  {name:'Sparks',st:'NV',lat:39.5349,lon:-119.7527},
  {name:'Enterprise',st:'NV',lat:36.0253,lon:-115.2367},
  // New Hampshire
  {name:'Concord',st:'NH',lat:43.2081,lon:-71.5376},
  {name:'Derry',st:'NH',lat:42.8812,lon:-71.3273},
  // New Jersey
  {name:'Clifton',st:'NJ',lat:40.8584,lon:-74.1638},
  {name:'Camden',st:'NJ',lat:39.9259,lon:-75.1196},
  {name:'Passaic',st:'NJ',lat:40.857,lon:-74.1285},
  {name:'Union City',st:'NJ',lat:40.7673,lon:-74.0324},
  {name:'Bayonne',st:'NJ',lat:40.6687,lon:-74.1143},
  {name:'East Orange',st:'NJ',lat:40.7673,lon:-74.2049},
  {name:'Vineland',st:'NJ',lat:39.4862,lon:-74.9271},
  {name:'New Brunswick',st:'NJ',lat:40.4873,lon:-74.4454},
  {name:'Perth Amboy',st:'NJ',lat:40.5068,lon:-74.2654},
  {name:'Toms River',st:'NJ',lat:39.9537,lon:-74.1979},
  // New Mexico
  {name:'Santa Fe',st:'NM',lat:35.687,lon:-105.9378},
  // New York
  {name:'New Rochelle',st:'NY',lat:40.9115,lon:-73.7826},
  {name:'Mount Vernon',st:'NY',lat:40.9126,lon:-73.8371},
  {name:'Schenectady',st:'NY',lat:42.8142,lon:-73.9396},
  {name:'Utica',st:'NY',lat:43.0962,lon:-75.2329},
  {name:'White Plains',st:'NY',lat:41.034,lon:-73.7629},
  {name:'Hempstead',st:'NY',lat:40.7062,lon:-73.619},
  // North Carolina
  {name:'Greenville',st:'NC',lat:35.6127,lon:-77.3663},
  {name:'Asheville',st:'NC',lat:35.5951,lon:-82.5515},
  {name:'Gastonia',st:'NC',lat:35.2621,lon:-81.1873},
  {name:'High Point',st:'NC',lat:35.9557,lon:-79.9858},
  {name:'Wilmington',st:'NC',lat:34.2104,lon:-77.8868},
  // North Dakota
  {name:'Bismarck',st:'ND',lat:46.8083,lon:-100.7837},
  {name:'Grand Forks',st:'ND',lat:47.9253,lon:-97.0329},
  // Ohio
  {name:'Parma',st:'OH',lat:41.3845,lon:-81.7229},
  {name:'Canton',st:'OH',lat:40.7989,lon:-81.3784},
  {name:'Youngstown',st:'OH',lat:41.0998,lon:-80.6495},
  {name:'Lorain',st:'OH',lat:41.4523,lon:-82.1824},
  {name:'Hamilton',st:'OH',lat:39.3995,lon:-84.5613},
  {name:'Springfield',st:'OH',lat:39.9242,lon:-83.8088},
  {name:'Kettering',st:'OH',lat:39.6895,lon:-84.1688},
  {name:'Elyria',st:'OH',lat:41.3684,lon:-82.1077},
  {name:'Lakewood',st:'OH',lat:41.4822,lon:-81.7982},
  {name:'Cuyahoga Falls',st:'OH',lat:41.1334,lon:-81.4845},
  // Oklahoma
  {name:'Edmond',st:'OK',lat:35.6528,lon:-97.4781},
  {name:'Lawton',st:'OK',lat:34.6036,lon:-98.3959},
  {name:'Moore',st:'OK',lat:35.3395,lon:-97.4867},
  {name:'Midwest City',st:'OK',lat:35.4495,lon:-97.3967},
  {name:'Stillwater',st:'OK',lat:36.1156,lon:-97.0584},
  // Oregon
  {name:'Bend',st:'OR',lat:44.0582,lon:-121.3153},
  {name:'Medford',st:'OR',lat:42.3265,lon:-122.8756},
  {name:'Springfield',st:'OR',lat:44.0462,lon:-122.9846},
  {name:'Corvallis',st:'OR',lat:44.5646,lon:-123.2620},
  // Pennsylvania
  {name:'Bethlehem',st:'PA',lat:40.6259,lon:-75.3705},
  {name:'Lancaster',st:'PA',lat:40.0379,lon:-76.3055},
  // Rhode Island
  {name:'Cranston',st:'RI',lat:41.7798,lon:-71.4373},
  {name:'Pawtucket',st:'RI',lat:41.8787,lon:-71.3826},
  // South Carolina
  {name:'Mount Pleasant',st:'SC',lat:32.8323,lon:-79.8284},
  {name:'Greenville',st:'SC',lat:34.8526,lon:-82.394},
  {name:'Rock Hill',st:'SC',lat:34.9249,lon:-81.025},
  {name:'Summerville',st:'SC',lat:33.0185,lon:-80.1756},
  // South Dakota
  {name:'Rapid City',st:'SD',lat:44.0805,lon:-103.2310},
  // Tennessee
  {name:'Franklin',st:'TN',lat:35.9251,lon:-86.8689},
  {name:'Jackson',st:'TN',lat:35.6145,lon:-88.8139},
  {name:'Johnson City',st:'TN',lat:36.3134,lon:-82.3535},
  {name:'Kingsport',st:'TN',lat:36.5484,lon:-82.5618},
  {name:'Hendersonville',st:'TN',lat:36.3048,lon:-86.62},
  // Texas
  {name:'Wichita Falls',st:'TX',lat:33.9137,lon:-98.4934},
  {name:'League City',st:'TX',lat:29.5075,lon:-95.0949},
  {name:'Pearland',st:'TX',lat:29.5635,lon:-95.2860},
  {name:'Allen',st:'TX',lat:33.1032,lon:-96.6705},
  {name:'Mansfield',st:'TX',lat:32.5632,lon:-97.1417},
  {name:'San Angelo',st:'TX',lat:31.4638,lon:-100.4370},
  {name:'Longview',st:'TX',lat:32.5007,lon:-94.7405},
  {name:'New Braunfels',st:'TX',lat:29.7030,lon:-98.1245},
  {name:'Edinburg',st:'TX',lat:26.3017,lon:-98.1633},
  {name:'Mission',st:'TX',lat:26.2159,lon:-98.3252},
  {name:'Bryan',st:'TX',lat:30.6744,lon:-96.3698},
  {name:'Harlingen',st:'TX',lat:26.1906,lon:-97.6961},
  {name:'Conroe',st:'TX',lat:30.3119,lon:-95.4561},
  // Utah
  {name:'Layton',st:'UT',lat:41.0602,lon:-111.9711},
  {name:'South Jordan',st:'UT',lat:40.5622,lon:-111.9296},
  {name:'Taylorsville',st:'UT',lat:40.6677,lon:-111.9388},
  {name:'Millcreek',st:'UT',lat:40.6869,lon:-111.8774},
  {name:'Murray',st:'UT',lat:40.6669,lon:-111.888},
  // Virginia
  {name:'Roanoke',st:'VA',lat:37.2710,lon:-79.9414},
  {name:'Portsmouth',st:'VA',lat:36.8354,lon:-76.2983},
  {name:'Suffolk',st:'VA',lat:36.7282,lon:-76.5836},
  {name:'Lynchburg',st:'VA',lat:37.4138,lon:-79.1422},
  {name:'Harrisonburg',st:'VA',lat:38.4496,lon:-78.8689},
  {name:'Charlottesville',st:'VA',lat:38.0293,lon:-78.4767},
  {name:'Blacksburg',st:'VA',lat:37.2296,lon:-80.4139},
  // Washington
  {name:'Redmond',st:'WA',lat:47.6740,lon:-122.1215},
  {name:'Marysville',st:'WA',lat:48.0512,lon:-122.1771},
  {name:'Kennewick',st:'WA',lat:46.2113,lon:-119.1372},
  {name:'Pasco',st:'WA',lat:46.2396,lon:-119.1006},
  {name:'Yakima',st:'WA',lat:46.6021,lon:-120.5059},
  {name:'Bellingham',st:'WA',lat:48.7519,lon:-122.4787},
  // Wisconsin
  {name:'Racine',st:'WI',lat:42.7261,lon:-87.7829},
  {name:'Appleton',st:'WI',lat:44.2619,lon:-88.4154},
  {name:'Waukesha',st:'WI',lat:43.0117,lon:-88.2315},
  {name:'Oshkosh',st:'WI',lat:44.0247,lon:-88.5426},
  {name:'Eau Claire',st:'WI',lat:44.8113,lon:-91.4985},
  {name:'Janesville',st:'WI',lat:42.6828,lon:-89.0187},
  {name:'La Crosse',st:'WI',lat:43.8014,lon:-91.2396},
  // Wyoming
  {name:'Cheyenne',st:'WY',lat:41.134,lon:-104.8202},
  {name:'Casper',st:'WY',lat:42.8501,lon:-106.3252},

  // ── Canada additions 50k–75k ────────────────────────────────────
  {name:'Peterborough',st:'ON',lat:44.3,lon:-78.3167},
  {name:'Brantford',st:'ON',lat:43.1394,lon:-80.2644},
  {name:'Nanaimo',st:'BC',lat:49.1658,lon:-123.9401},
  {name:'Kamloops',st:'BC',lat:50.6745,lon:-120.3273},
  {name:'Chilliwack',st:'BC',lat:49.1577,lon:-121.9509},
  {name:'Prince George',st:'BC',lat:53.9171,lon:-122.7497},
  {name:'Medicine Hat',st:'AB',lat:50.0418,lon:-110.6775},
  {name:'Terrebonne',st:'QC',lat:45.7,lon:-73.6333},
  {name:'Sault Ste. Marie',st:'ON',lat:46.5136,lon:-84.3358},
  {name:'Prince Albert',st:'SK',lat:53.2033,lon:-105.7531},
  {name:'Moose Jaw',st:'SK',lat:50.3933,lon:-105.5519},
  {name:'Brandon',st:'MB',lat:49.8483,lon:-99.9501},
  {name:'Charlottetown',st:'PE',lat:46.2382,lon:-63.1311},
  {name:'Belleville',st:'ON',lat:44.1628,lon:-77.3832},
  {name:'North Bay',st:'ON',lat:46.3091,lon:-79.4608},
  {name:'Cornwall',st:'ON',lat:45.0275,lon:-74.7278},
  {name:'Halton Hills',st:'ON',lat:43.63,lon:-79.8833},
  {name:'Maple Ridge',st:'BC',lat:49.2193,lon:-122.5969},
  {name:'New Westminster',st:'BC',lat:49.2069,lon:-122.9110},

  // ── Mexico additions 50k–75k ────────────────────────────────────
  {name:'Colima',st:'MX',lat:19.2452,lon:-103.7241},
  {name:'Campeche',st:'MX',lat:19.8301,lon:-90.5349},
  {name:'Chetumal',st:'MX',lat:18.5001,lon:-88.3},
  {name:'Ciudad del Carmen',st:'MX',lat:18.6501,lon:-91.8002},
  {name:'Iguala',st:'MX',lat:18.3476,lon:-99.5398},
  {name:'Tehuacan',st:'MX',lat:18.4583,lon:-97.3917},
  {name:'Monclova',st:'MX',lat:26.9063,lon:-101.4216},
];
const AIRPORTS = [
  // ── USA — Major hubs ──────────────────────────────────────────
  {id:'ATL',name:'Atlanta',        lat:33.6407, lon:-84.4277},
  {id:'ORD',name:'Chicago OHare',lat:41.9742, lon:-87.9073},
  {id:'LAX',name:'Los Angeles',    lat:33.9425, lon:-118.4081},
  {id:'DFW',name:'Dallas/FW',      lat:32.8998, lon:-97.0403},
  {id:'DEN',name:'Denver',         lat:39.8561, lon:-104.6737},
  {id:'JFK',name:'New York',       lat:40.6413, lon:-73.7781},
  {id:'SFO',name:'San Francisco',  lat:37.6213, lon:-122.3790},
  {id:'LAS',name:'Las Vegas',      lat:36.0840, lon:-115.1537},
  {id:'SEA',name:'Seattle',        lat:47.4502, lon:-122.3088},
  {id:'MCO',name:'Orlando',        lat:28.4294, lon:-81.3089},
  {id:'EWR',name:'Newark',         lat:40.6925, lon:-74.1687},
  {id:'MSP',name:'Minneapolis',    lat:44.8848, lon:-93.2223},
  {id:'DTW',name:'Detroit',        lat:42.2162, lon:-83.3554},
  {id:'BOS',name:'Boston',         lat:42.3656, lon:-71.0096},
  {id:'PHX',name:'Phoenix',        lat:33.4373, lon:-112.0078},
  {id:'PHL',name:'Philadelphia',   lat:39.8721, lon:-75.2431},
  {id:'IAH',name:'Houston Intl',   lat:29.9902, lon:-95.3368},
  {id:'CLT',name:'Charlotte',      lat:35.2140, lon:-80.9431},
  {id:'MIA',name:'Miami',          lat:25.7959, lon:-80.2870},
  {id:'FLL',name:'Fort Lauderdale',lat:26.0726, lon:-80.1527},
  {id:'BWI',name:'Baltimore',      lat:39.1754, lon:-76.6682},
  {id:'DCA',name:'Washington',     lat:38.8512, lon:-77.0402},
  {id:'IAD',name:'Dulles',         lat:38.9531, lon:-77.4565},
  {id:'SLC',name:'Salt Lake City', lat:40.7884, lon:-111.9778},
  {id:'SAN',name:'San Diego',      lat:32.7336, lon:-117.1897},
  {id:'HNL',name:'Honolulu',       lat:21.3245, lon:-157.9251},
  {id:'ANC',name:'Anchorage',      lat:61.1743, lon:-149.9961},
  {id:'MCI',name:'Kansas City',    lat:39.2976, lon:-94.7139},
  {id:'STL',name:'St. Louis',      lat:38.7487, lon:-90.3700},
  {id:'MSY',name:'New Orleans',    lat:29.9934, lon:-90.2580},
  {id:'BNA',name:'Nashville',      lat:36.1245, lon:-86.6782},
  {id:'RDU',name:'Raleigh-Durham', lat:35.8777, lon:-78.7875},
  {id:'MDW',name:'Chicago Midway', lat:41.7860, lon:-87.7524},
  {id:'AUS',name:'Austin',         lat:30.1975, lon:-97.6664},
  {id:'TPA',name:'Tampa',          lat:27.9755, lon:-82.5332},
  {id:'PDX',name:'Portland',       lat:45.5887, lon:-122.5975},
  {id:'CLE',name:'Cleveland',      lat:41.4058, lon:-81.8549},
  {id:'PIT',name:'Pittsburgh',     lat:40.4915, lon:-80.2329},
  {id:'CMH',name:'Columbus',       lat:39.9980, lon:-82.8919},
  {id:'IND',name:'Indianapolis',   lat:39.7173, lon:-86.2944},
  {id:'MKE',name:'Milwaukee',      lat:42.9472, lon:-87.8966},
  {id:'ABQ',name:'Albuquerque',    lat:35.0402, lon:-106.6090},
  {id:'SMF',name:'Sacramento',     lat:38.6954, lon:-121.5908},
  {id:'RNO',name:'Reno',           lat:39.4991, lon:-119.7681},
  {id:'OAK',name:'Oakland',        lat:37.7213, lon:-122.2208},
  {id:'SJC',name:'San Jose',       lat:37.3626, lon:-121.9290},
  {id:'BUR',name:'Burbank',        lat:34.2007, lon:-118.3585},
  {id:'SNA',name:'Orange County',  lat:33.6757, lon:-117.8682},
  {id:'GEG',name:'Spokane',        lat:47.6199, lon:-117.5338},
  {id:'BOI',name:'Boise',          lat:43.5644, lon:-116.2228},
  {id:'FAT',name:'Fresno',         lat:36.7762, lon:-119.7182},
  {id:'PSP',name:'Palm Springs',   lat:33.8297, lon:-116.5070},
  // ── USA — Northeast ────────────────────────────────────────────
  {id:'BUF',name:'Buffalo',        lat:42.9405, lon:-78.7322},
  {id:'SYR',name:'Syracuse',       lat:43.1112, lon:-76.1063},
  {id:'ROC',name:'Rochester',      lat:43.1189, lon:-77.6724},
  {id:'ALB',name:'Albany',         lat:42.7483, lon:-73.8020},
  {id:'BDL',name:'Hartford',       lat:41.9389, lon:-72.6832},
  {id:'PVD',name:'Providence',     lat:41.7270, lon:-71.4282},
  {id:'MHT',name:'Manchester NH',  lat:42.9326, lon:-71.4357},
  {id:'PWM',name:'Portland ME',    lat:43.6462, lon:-70.3093},
  {id:'HPN',name:'Westchester',    lat:41.0670, lon:-73.7076},
  {id:'ACY',name:'Atlantic City',  lat:39.4576, lon:-74.5772},
  {id:'BTV',name:'Burlington VT',  lat:44.4719, lon:-73.1533},
  // ── USA — Southeast ────────────────────────────────────────────
  {id:'ORF',name:'Norfolk',        lat:36.8976, lon:-76.0133},
  {id:'RIC',name:'Richmond',       lat:37.5052, lon:-77.3197},
  {id:'CHS',name:'Charleston SC',  lat:32.8988, lon:-80.0405},
  {id:'SAV',name:'Savannah',       lat:32.1276, lon:-81.2021},
  {id:'JAX',name:'Jacksonville',   lat:30.4941, lon:-81.6879},
  {id:'PBI',name:'West Palm Beach',lat:26.6832, lon:-80.0956},
  {id:'RSW',name:'Fort Myers',     lat:26.5362, lon:-81.7553},
  {id:'PIE',name:'St Pete-Clrwtr', lat:27.9102, lon:-82.6874},
  {id:'MYR',name:'Myrtle Beach',   lat:33.6797, lon:-78.9283},
  {id:'GSP',name:'Greenville SC',  lat:34.8957, lon:-82.2190},
  {id:'AVL',name:'Asheville',      lat:35.4362, lon:-82.5418},
  {id:'PNS',name:'Pensacola',      lat:30.4734, lon:-87.1866},
  {id:'MOB',name:'Mobile',         lat:30.6912, lon:-88.2428},
  {id:'BHM',name:'Birmingham',     lat:33.5629, lon:-86.7535},
  {id:'HSV',name:'Huntsville',     lat:34.6372, lon:-86.7751},
  {id:'LIT',name:'Little Rock',    lat:34.7294, lon:-92.2243},
  // ── USA — South/Southwest ──────────────────────────────────────
  {id:'SAT',name:'San Antonio',    lat:29.5337, lon:-98.4698},
  {id:'ELP',name:'El Paso',        lat:31.8072, lon:-106.3779},
  {id:'TUL',name:'Tulsa',          lat:36.1984, lon:-95.8881},
  {id:'OKC',name:'Oklahoma City',  lat:35.3931, lon:-97.6007},
  {id:'CRP',name:'Corpus Christi', lat:27.7704, lon:-97.5012},
  {id:'MAF',name:'Midland',        lat:31.9425, lon:-102.2019},
  {id:'LBB',name:'Lubbock',        lat:33.6636, lon:-101.8228},
  {id:'AMA',name:'Amarillo',       lat:35.2194, lon:-101.7060},
  // ── USA — Mountain/Rockies ─────────────────────────────────────
  {id:'COS',name:'Colorado Sprgs', lat:38.8059, lon:-104.7009},
  {id:'ASE',name:'Aspen',          lat:39.2232, lon:-106.8693},
  {id:'MTJ',name:'Montrose',       lat:38.5098, lon:-107.8939},
  {id:'GJT',name:'Grand Junction', lat:39.1224, lon:-108.5268},
  {id:'BZN',name:'Bozeman',        lat:45.7775, lon:-111.1530},
  {id:'MSO',name:'Missoula',       lat:46.9163, lon:-114.0906},
  {id:'FCA',name:'Kalispell',      lat:48.3105, lon:-114.2560},
  {id:'BOZ',name:'Great Falls',    lat:47.4820, lon:-111.3709},
  {id:'JAC',name:'Jackson Hole',   lat:43.6073, lon:-110.7377},
  {id:'CPR',name:'Casper',         lat:42.9080, lon:-106.4644},
  {id:'DRO',name:'Durango',        lat:37.1515, lon:-107.7538},
  // ── USA — Midwest ──────────────────────────────────────────────
  {id:'DSM',name:'Des Moines',     lat:41.5340, lon:-93.6630},
  {id:'OMA',name:'Omaha',          lat:41.3032, lon:-95.8941},
  {id:'ICT',name:'Wichita',        lat:37.6498, lon:-97.4331},
  {id:'FAR',name:'Fargo',          lat:46.9207, lon:-96.8158},
  {id:'BIS',name:'Bismarck',       lat:46.7727, lon:-100.7467},
  {id:'FSD',name:'Sioux Falls',    lat:43.5820, lon:-96.7419},
  {id:'GRR',name:'Grand Rapids',   lat:42.8808, lon:-85.5228},
  {id:'CVG',name:'Cincinnati',     lat:39.0488, lon:-84.6678},
  {id:'SDF',name:'Louisville',     lat:38.1744, lon:-85.7360},
  {id:'DAY',name:'Dayton',         lat:39.9024, lon:-84.2194},
  {id:'LEX',name:'Lexington',      lat:38.0364, lon:-84.6060},
  {id:'MDT',name:'Harrisburg',     lat:40.1935, lon:-76.7634},
  {id:'MEM',name:'Memphis',        lat:35.0424, lon:-89.9767},
  {id:'DLH',name:'Duluth',         lat:46.8421, lon:-92.1936},
  {id:'MSN',name:'Madison',        lat:43.1399, lon:-89.3375},
  {id:'GRB',name:'Green Bay',      lat:44.4851, lon:-88.1296},
  // ── USA — Alaska & Hawaii ──────────────────────────────────────
  {id:'FAI',name:'Fairbanks',      lat:64.8151, lon:-147.8560},
  {id:'JNU',name:'Juneau',         lat:58.3550, lon:-134.5762},
  {id:'OGG',name:'Maui',           lat:20.8986, lon:-156.4305},
  {id:'KOA',name:'Kona',           lat:19.7388, lon:-156.0456},
  // ── Canada ────────────────────────────────────────────────────
  {id:'YYZ',name:'Toronto',        lat:43.6777, lon:-79.6248},
  {id:'YUL',name:'Montreal',       lat:45.4706, lon:-73.7408},
  {id:'YVR',name:'Vancouver',      lat:49.1947, lon:-123.1842},
  {id:'YYC',name:'Calgary',        lat:51.1315, lon:-114.0108},
  {id:'YEG',name:'Edmonton',       lat:53.3097, lon:-113.5797},
  {id:'YOW',name:'Ottawa',         lat:45.3225, lon:-75.6692},
  {id:'YQB',name:'Quebec City',    lat:46.7911, lon:-71.3933},
  {id:'YHZ',name:'Halifax',        lat:44.8808, lon:-63.5086},
  {id:'YWG',name:'Winnipeg',       lat:49.9100, lon:-97.2398},
  {id:'YXE',name:'Saskatoon',      lat:52.1708, lon:-106.6993},
  {id:'YYJ',name:'Victoria',       lat:48.6469, lon:-123.4258},
  // ── Mexico ────────────────────────────────────────────────────
  {id:'MEX',name:'Mexico City',    lat:19.4363, lon:-99.0721},
  {id:'CUN',name:'Cancun',         lat:21.0365, lon:-86.8771},
  {id:'GDL',name:'Guadalajara',    lat:20.5218, lon:-103.3111},
  {id:'MTY',name:'Monterrey',      lat:25.7785, lon:-100.1069},
  {id:'TIJ',name:'Tijuana',        lat:32.5411, lon:-116.9701},
  {id:'SJD',name:'Los Cabos',      lat:23.1518, lon:-109.7213},
  {id:'PVR',name:'Puerto Vallarta',lat:20.6801, lon:-105.2544},
];

const nearestCity = (lat,lon) => {
  let best={name:'unknown',d:Infinity};
  CITIES.forEach(c=>{const d=haversine(lat,lon,c.lat,c.lon);if(d<best.d) best={name:`${c.name}, ${c.st}`,d};});
  return best.name;
};


const LOG_KEY='soratomo_logbook', PROX_KEY='soratomo_prox';
const GAL_KEY      ='soratomo_gallery';
const TYPE_CACHE_KEY='soratomo_type_cache';
const MAX_TYPE_CACHE=2000; // hex entries; ~100KB at ~50B each
const loadTypeCache=()=>{
  try{return new Map(JSON.parse(localStorage.getItem(TYPE_CACHE_KEY)||'[]'));}
  catch{return new Map();}
};
const saveTypeCache=map=>{
  try{
    const entries=[...map.entries()]
      .filter(([,v])=>v&&typeof v==='object') // skip pending/null
      .slice(-MAX_TYPE_CACHE);
    localStorage.setItem(TYPE_CACHE_KEY,JSON.stringify(entries));
  }catch{}
};
const loadGallery=()=>{try{return JSON.parse(localStorage.getItem(GAL_KEY)||'[]');}catch{return [];}};
const saveGallery=g=>{try{localStorage.setItem(GAL_KEY,JSON.stringify(g));}catch{}};
const loadLog   = () => {try{const r=JSON.parse(localStorage.getItem(LOG_KEY)||'[]');return r.filter(e=>Array.isArray(e.tails));}catch{return [];}};
const saveLog   = e  => {try{localStorage.setItem(LOG_KEY,JSON.stringify(e));}catch{}};
const loadProx  = () => {try{return Math.min(25,parseInt(localStorage.getItem(PROX_KEY)||'10'));}catch{return 10;}};

// ── AircraftMarker ─────────────────────────────────────────────
const AircraftMarker = React.memo(function AircraftMarker({ f, isSelected, dimmed, tiltMode, onSelect, loggedCallsigns, loggedTypes, proximityM, isDisplayNew }) {
  const cat        = getAircraftCat(f.type, f.emitter||'');
  const color      = cat==='military' ? '#ff8c00' : altColor(f.alt); // orange for military
  const dNmi       = f.dist/1852;
  const isNearby   = f.dist <= proximityM;
  const isNewAc    = !loggedCallsigns.has(f.cs);
  // Red ring: first-ever sighting of this ICAO type (takes priority over green/amber)
  const isNewType  = isNearby && f.type && f.type!=='UNKN' && !(loggedTypes||new Set()).has(f.type);

  // Ring priority: red (new type) > green (new tail) > amber (seen tail) > altitude color
  const ringColor  = isNearby
    ? (isNewType ? '#ff3b3b' : (isNewAc ? '#2dffb4' : '#ffb84d'))
    : (isNewAc ? '#2dffb455' : color);
  const badgeColor = isNearby ? (isNewType ? '#ff3b3b' : (isNewAc ? '#2dffb4' : '#ffb84d')) : null;

  // Log-linear size scale: very dramatic range — 58px at 1nmi, 34px at 10nmi, 17px at 50nmi, 11px at 100+nmi
  const rawSize  = Math.max(11, Math.min(58, Math.round(58 - Math.log10(Math.max(0.5,dNmi)) * 24)));
  const iconSize = isSelected ? rawSize+8 : rawSize;
  // Ring sizes also scale with icon
  const ringInner  = Math.round(rawSize * 1.35);
  const ringOuter  = Math.round(rawSize * 1.85);

  // 3D aspect: rotate by hdg-bear → nose points in direction of flight as seen from ground
  const aspect     = ((f.hdg-f.bear)+360)%360;
  const wingFC     = 1; // fixed — icons always show full wingspan regardless of heading

  return (
    <div onClick={e=>{e.stopPropagation();onSelect(f);}} style={{
      position:'absolute',left:`${f.x}%`,top:`${f.y}%`,
      transform:'translate(-50%,-50%)',cursor:'pointer',
      zIndex:isSelected?20:10,
      opacity:dimmed?0.28:1,
      transition:'opacity 0.25s ease',
    }}>
      {/* Uncertainty bubble — tilt/camera mode only, selected aircraft only */}
      {isSelected && tiltMode && (
        <div style={{
          position:'absolute',
          left:'50%', top:'50%',
          width:`${f.uncertRadiusVw*2}vw`,
          height:`${f.uncertRadiusVw*2}vw`,
          transform:'translate(-50%,-50%)',
          borderRadius:'50%',
          border:`1px dashed ${color}`,
          background:`${color}0d`,
          opacity:0.55,
          pointerEvents:'none',
          zIndex:-1,
          transition:'width 0.8s ease, height 0.8s ease',
        }}/>
      )}
      {/* Entry ping — one-shot on first appearance */}
      {isDisplayNew&&<>
        <div style={{position:'absolute',width:ringOuter+8,height:ringOuter+8,borderRadius:'50%',
          border:`1.5px solid ${color}cc`,top:'50%',left:'50%',pointerEvents:'none',
          animation:'ping 1.1s ease-out 1 forwards'}}/>
        <div style={{position:'absolute',width:ringOuter+8,height:ringOuter+8,borderRadius:'50%',
          border:`1px solid ${color}88`,top:'50%',left:'50%',pointerEvents:'none',
          animation:'ping 1.1s ease-out 0.22s 1 forwards'}}/>
        <div style={{position:'absolute',width:ringOuter+8,height:ringOuter+8,borderRadius:'50%',
          border:`1px solid ${color}44`,top:'50%',left:'50%',pointerEvents:'none',
          animation:'ping 1.1s ease-out 0.44s 1 forwards'}}/>
      </>}
      {/* Primary ring */}
      <div style={{
        position:'absolute',width:isNearby?ringInner+16:ringInner,height:isNearby?ringInner+16:ringInner,
        borderRadius:'50%',border:`1.5px solid ${ringColor}${isNearby?'99':'66'}`,
        top:'50%',left:'50%',transform:'translate(-50%,-50%)',
        animation:`ring ${isNewType?'1.4s':'2.8s'} ease-out infinite`,pointerEvents:'none',
      }}/>
      {/* Secondary ring when nearby or selected */}
      {(isNearby||isSelected) && <div style={{
        position:'absolute',width:isNearby?ringOuter+16:ringOuter,height:isNearby?ringOuter+16:ringOuter,
        borderRadius:'50%',border:`1px solid ${ringColor}${isNearby?'55':'33'}`,
        top:'50%',left:'50%',transform:'translate(-50%,-50%)',
        animation:'ring 2.8s ease-out infinite 0.7s',pointerEvents:'none',
      }}/>}

      {/* Aircraft silhouette + NEW dot wrapped together */}
      <div style={{position:'relative',display:'inline-block'}}>
        <svg width={iconSize} height={iconSize} viewBox="-12 -12 24 24"
          style={{display:'block',overflow:'visible',
            filter:`drop-shadow(0 0 ${isNearby?6:4}px ${ringColor}88)`,
            transform:`rotate(${aspect}deg)`,
          }}>
          <PlaneShape cat={cat} color={color} fc={wingFC}/>
        </svg>
        {/* NEW dot: anchored to SVG top-right corner, always outside the icon */}
        {isNewAc && (
          <div style={{
            position:'absolute',top:-4,right:-4,
            width:10,height:10,borderRadius:'50%',
            background:'#2dffb4',border:'2px solid #010a18',
            pointerEvents:'none',
          }}/>
        )}
      </div>

      {/* Callsign label */}
      <div style={{
        position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',
        marginTop:4,color,fontSize:Math.max(8,Math.min(10,rawSize*0.22)),
        fontFamily:"'Orbitron',monospace",fontWeight:700,
        whiteSpace:'nowrap',letterSpacing:'0.06em',textShadow:`0 0 8px ${color}`,
        background:'rgba(1,8,20,0.6)',padding:'1px 5px',borderRadius:3,pointerEvents:'none',
      }}>{f.cs}</div>

      {/* Proximity badge */}
      {isNearby && (
        <div style={{
          position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',
          marginTop:16+Math.max(8,Math.min(10,rawSize*0.22)),
          background: isNewAc?'rgba(45,255,180,0.12)':'rgba(255,184,77,0.12)',
          border:`1px solid ${badgeColor}55`,
          borderRadius:3,padding:'1px 5px',
          fontSize:9,color:badgeColor,
          fontFamily:"'Orbitron',monospace",letterSpacing:'.06em',
          whiteSpace:'nowrap',pointerEvents:'none',
        }}>{isNewType ? '★ NEW TYPE! ' : (isNewAc ? 'NEW! ' : '')}{distNmi(f.dist)} NMI</div>
      )}
    </div>
  );
}
, (prev,next)=>{
  // Only re-render if visually relevant props changed
  if(prev.isSelected!==next.isSelected||prev.isDisplayNew!==next.isDisplayNew) return false;
  if(prev.proximityM!==next.proximityM||prev.loggedCallsigns!==next.loggedCallsigns||prev.loggedTypes!==next.loggedTypes) return false;
  if(prev.onSelect!==next.onSelect) return false;
  if(prev.f.id!==next.f.id||prev.f.cs!==next.f.cs||prev.f.type!==next.f.type) return false;
  if(prev.f.alt!==next.f.alt||prev.f.hdg!==next.f.hdg||prev.f.spd!==next.f.spd) return false;
  if(Math.abs(prev.f.x-next.f.x)>0.05||Math.abs(prev.f.y-next.f.y)>0.05) return false;
  if((prev.f.trail?.length??0)!==(next.f.trail?.length??0)) return false;
  return true; // equal — skip re-render
});

// ── Toast notifications ────────────────────────────────────────
function Toasts({ items }) {
  return (
    <div style={{position:'absolute',bottom:52,right:10,zIndex:45,
      display:'flex',flexDirection:'column-reverse',gap:6,pointerEvents:'none',maxWidth:185}}>
      {items.map(n=>(
        <div key={n.nid} style={{
          background:'rgba(2,10,30,0.96)',
          border:`1px solid ${n.isNew?'rgba(45,255,180,0.5)':'rgba(255,184,77,0.4)'}`,
          borderRadius:9,padding:'9px 12px',
          animation:'slideUp 0.3s ease',
        }}>
          <div style={{fontSize:8.5,fontFamily:"'Orbitron',monospace",letterSpacing:'.1em',marginBottom:3,
            color:n.isNew?'#2dffb4':'#ffb84d'}}>
            {n.isNew ? 'NEW AIRCRAFT LOGGED' : 'AIRCRAFT LOGGED'}
          </div>
          <div style={{fontSize:12,color:'#b8e4ff',fontFamily:"'Orbitron',monospace",fontWeight:700}}>{n.cs}</div>
          <div style={{fontSize:11,color:'#5a8898',fontFamily:"'Exo 2',sans-serif",marginTop:2}}>{n.airline}</div>
          <div style={{fontSize:9,color:'#3a7888',fontFamily:"'Orbitron',monospace",marginTop:2}}>
            CLOSEST {n.closestNmi} NMI
          </div>
        </div>
      ))}
    </div>
  );
}


// ── CityMarker ─────────────────────────────────────────────────
function CityMarker({ city, heading, devicePitch, fov }) {
  if(city.dist>185200) return null; // 185.2 km = 100 nmi
  const vfov=fov*(VFOV/HFOV);
  const sc=toScreenTilt(city.bear,-1,heading,devicePitch,fov,vfov);
  if(!sc.on) return null;
  const {x,y}=sc;
  const diff=((city.bear-heading+540)%360)-180;
  const fade=Math.max(0,1-Math.abs(diff)/(fov/2));
  const distFade=Math.min(1,city.dist/80000);
  const opacity=fade*0.65*Math.min(1,distFade+0.3);
  return (
    <div style={{position:'absolute',left:`${x}%`,top:`${y}%`,
      transform:'translate(-50%,-50%)',textAlign:'center',
      pointerEvents:'none',zIndex:3,opacity}}>
      <div style={{width:3,height:3,background:'rgba(100,180,220,0.5)',borderRadius:'50%',margin:'0 auto 3px'}}/>
      <div style={{fontSize:9,color:'#7abcd8',fontFamily:"'Orbitron',monospace",whiteSpace:'nowrap',letterSpacing:'.05em'}}>{city.name}</div>
      <div style={{fontSize:8,color:'rgba(100,170,200,0.55)',fontFamily:"'Orbitron',monospace"}}>{distNmi(city.dist)} nmi</div>
    </div>
  );
}

// ── CompassStrip ───────────────────────────────────────────────
function CompassStrip({ heading }) {
  const cardinal={0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'};
  const ticks=[];
  for(let d=0;d<360;d+=5){
    const diff=((d-heading+540)%360)-180;
    if(Math.abs(diff)>75) continue;
    const x=50+(diff/75)*50,fade=1-Math.abs(diff)/75;
    const isCard=d%90===0,isMaj=d%45===0;
    ticks.push({d,x,fade,isCard,isMaj,label:cardinal[d]||(isMaj?String(d):null)});
  }
  return (
    <div style={{position:'relative',height:44,overflow:'hidden'}}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:'14%',background:'linear-gradient(90deg,rgba(1,8,20,1),transparent)',zIndex:2,pointerEvents:'none'}}/>
      <div style={{position:'absolute',right:0,top:0,bottom:0,width:'14%',background:'linear-gradient(-90deg,rgba(1,8,20,1),transparent)',zIndex:2,pointerEvents:'none'}}/>
      <div style={{position:'absolute',left:'50%',top:0,transform:'translateX(-50%)',zIndex:3,
        width:0,height:0,borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:'7px solid #4db8ff'}}/>
      {ticks.map(t=>(
        <div key={t.d} style={{position:'absolute',left:`${t.x}%`,top:8,transform:'translateX(-50%)',opacity:0.35+t.fade*0.65}}>
          <div style={{width:t.isCard?2:t.isMaj?1.5:1,height:t.isCard?16:t.isMaj?11:7,
            background:t.isCard?'#b8e4ff':t.isMaj?'#4db8ff88':'#1a4a6a',margin:'0 auto',borderRadius:1}}/>
          {t.label&&<div style={{fontSize:t.isCard?10:8,fontFamily:"'Orbitron',monospace",
            fontWeight:t.isCard?700:400,color:t.isCard?'#b8e4ff':'#5a9ab8',
            textAlign:'center',marginTop:2,letterSpacing:'0.03em'}}>{t.label}</div>}
        </div>
      ))}
    </div>
  );
}

// ── FlightCard ─────────────────────────────────────────────────
function FlightCard({ f, onClose, loggedCallsigns }) {
  const catFC=getAircraftCat(f.type, f.emitter||'');
  const color=catFC==='military'?'#ff8c00':altColor(f.alt);
  const over=nearestCity(f.lat,f.lon);
  const cat=catFC;
  const catLabel={'narrow':'Narrowbody','wide':'Widebody','super':'Superjumbo',
    'jumbo':'Jumbo','regional':'Regional Jet','bizjet':'Business Jet'}[cat]||'Aircraft';
  const isNew=!loggedCallsigns.has(f.cs);
  const stats=[
    {l:'ALTITUDE',v:`${mToFt(f.alt)} ft`},
    {l:'SPEED',v:`${msToKts(f.spd)} kts`},
    {l:'DISTANCE',v:`${distNmi(f.dist)} nmi`},
    {l:'BEARING',v:`${Math.round(f.bear)}\u00b0`},
    {l:'HEADING',v:`${Math.round(f.hdg)}\u00b0`},
    {l:'ELEV AGL',v:`${Math.round(f.elev)}\u00b0`},
  ];
  return (
    <div onClick={e=>e.stopPropagation()} style={{
      position:'absolute',bottom:0,left:0,right:0,zIndex:50,
      background:'linear-gradient(175deg,rgba(3,12,28,0.97) 0%,rgba(2,8,20,0.99) 100%)',
      borderTop:`1px solid ${isNew?'#2dffb455':color+'2a'}`,borderRadius:'14px 14px 0 0',
      padding:'16px 16px 18px',animation:'slideUp 0.28s cubic-bezier(0.2,0,0.2,1)',
    }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{fontSize:21,fontFamily:"'Orbitron',monospace",fontWeight:700,color,
              letterSpacing:'0.12em',lineHeight:1,textShadow:`0 0 20px ${color}55`}}>{f.cs}</div>
            {isNew && <div style={{fontSize:9,background:'rgba(45,255,180,0.12)',
              border:'1px solid #2dffb455',borderRadius:4,padding:'2px 6px',
              color:'#2dffb4',fontFamily:"'Orbitron',monospace",letterSpacing:'.08em'}}>NEW</div>}
          </div>
          <div style={{fontSize:12,color:'#7aacc8',fontFamily:"'Exo 2',sans-serif",marginTop:4}}>
            {f.airline}{f.type&&<span style={{color:'#5a8898',marginLeft:8}}>· {f.type}</span>}
            <span style={{color:'#3a6878',marginLeft:6,fontSize:11}}>({catLabel})</span>
          </div>
        </div>
        <button onClick={onClose} style={{background:'transparent',border:`1px solid ${color}25`,
          borderRadius:6,color:'#6a9ab8',fontSize:12,cursor:'pointer',padding:'4px 10px',
          fontFamily:"'Orbitron',monospace",letterSpacing:'0.06em'}}>X CLOSE</button>
      </div>
      <div style={{background:'rgba(4,15,36,0.9)',borderRadius:7,border:`0.5px solid ${color}18`,
        padding:'6px 10px',marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:9,color:'#6a98b8',fontFamily:"'Orbitron',monospace",letterSpacing:'.1em'}}>OVER</span>
        <span style={{fontSize:12,color:'#a8d8f0',fontFamily:"'Orbitron',monospace",fontWeight:600}}>{over}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
        {stats.map(s=>(
          <div key={s.l} style={{background:'rgba(8,20,48,0.85)',borderRadius:8,
            padding:'8px 9px',border:'0.5px solid rgba(25,55,95,0.7)'}}>
            <div style={{fontSize:9,color:'#6a98b8',fontFamily:"'Orbitron',monospace",letterSpacing:'0.07em',marginBottom:4}}>{s.l}</div>
            <div style={{fontSize:12,color:'#90c8e8',fontFamily:"'Orbitron',monospace",fontWeight:600,whiteSpace:'nowrap'}}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shared timestamp formatter used by Logbook and Stats
const fmtTime = ts => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})
    +' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
};

// ── Logbook ────────────────────────────────────────────────────
function Logbook({ entries, proximityNmi, onProxChange, onClose, onClear }) {
  const fmt = fmtTime;
  // Filter by range: tails must have come within proximityNmi; hide type if no tails remain
  const filtered=entries
    .map(e=>({...e,tails:e.tails.filter(t=>t.closestNmi<=proximityNmi)}))
    .filter(e=>e.tails.length>0);
  const totalTails=filtered.reduce((s,e)=>s+e.tails.length,0);
  const catLabel=c=>({'narrow':'Narrowbody','wide':'Widebody','super':'Superjumbo',
    'jumbo':'Jumbo','regional':'Regional Jet','bizjet':'Business Jet','military':'Military'}[c]||'Aircraft');

  return (
    <div onClick={e=>e.stopPropagation()} style={{
      position:'absolute',inset:0,zIndex:60,
      background:'rgba(1,6,18,0.98)',
      display:'flex',flexDirection:'column',
      animation:'slideUp 0.3s ease',
    }}>
      {/* Header */}
      <div style={{padding:'14px 16px 10px',borderBottom:'1px solid rgba(77,184,255,0.12)',flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
          <div style={{fontSize:12,fontFamily:"'Orbitron',monospace",fontWeight:700,color:'#b8e4ff',letterSpacing:'.18em'}}>LOGBOOK</div>
          <button onClick={onClose} style={{background:'transparent',border:'1px solid rgba(77,184,255,0.2)',
            borderRadius:6,color:'#5a8898',fontSize:12,cursor:'pointer',padding:'4px 10px',
            fontFamily:"'Orbitron',monospace"}}>X CLOSE</button>
        </div>
        <div style={{fontSize:10,color:'#5a8898',fontFamily:"'Orbitron',monospace",marginBottom:8}}>
          {filtered.length} TYPE{filtered.length!==1?'S':''} · {totalTails} TAIL{totalTails!==1?'S':''}
        </div>
        <div style={{marginBottom:6}}>
          <div style={{fontSize:9,color:'#4a7898',fontFamily:"'Orbitron',monospace",letterSpacing:'.1em',marginBottom:5}}>LOG & FILTER WITHIN</div>
          <div style={{display:'flex',gap:5}}>
            {[5,10,25].map(n=>(
              <div key={n} onClick={()=>onProxChange(n)} style={{
                flex:1,textAlign:'center',padding:'5px 0',
                background:proximityNmi===n?'rgba(77,184,255,0.18)':'transparent',
                border:`1px solid ${proximityNmi===n?'#4db8ff':'rgba(77,184,255,0.2)'}`,
                borderRadius:5,cursor:'pointer',
                fontSize:11,color:proximityNmi===n?'#4db8ff':'#4a7888',
                fontFamily:"'Orbitron',monospace",fontWeight:proximityNmi===n?600:400,
              }}>{n} nmi</div>
            ))}
          </div>
        </div>
        {entries.length>0&&(
          <div onClick={onClear} style={{fontSize:9,color:'#3a6878',fontFamily:"'Orbitron',monospace",
            cursor:'pointer',textDecoration:'underline',letterSpacing:'.06em',display:'inline-block'}}>CLEAR ALL</div>
        )}
      </div>

      {/* List — one row per aircraft type */}
      <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'6px 0'}}>
        {filtered.length===0?(
          <div style={{textAlign:'center',padding:'48px 20px',color:'#3a6878',
            fontSize:11,fontFamily:"'Orbitron',monospace",lineHeight:2,letterSpacing:'.08em'}}>
            {entries.length===0
              ?<>NO ENCOUNTERS YET<br/><span style={{fontSize:10,color:'#2a4a58'}}>FLY WITHIN THE LOG RADIUS<br/>TO LOG AN AIRCRAFT</span></>
              :<>NO ENCOUNTERS WITHIN {proximityNmi} NMI<br/><span style={{fontSize:10,color:'#2a4a58'}}>TRY A LARGER RANGE ABOVE</span></>}
          </div>
        ):filtered.map(e=>{
          const cat=e.cat||getAircraftCat(e.type!=='UNKN'?e.type:'');
          const maxAltM=Math.max(...e.tails.map(t=>t.alt))/3.28084;
          const col=altColor(maxAltM);
          return (
            <div key={e.id} style={{padding:'10px 16px',borderBottom:'0.5px solid rgba(77,184,255,0.07)'}}>
              {/* Type header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <svg width="26" height="26" viewBox="-12 -12 24 24" style={{flexShrink:0,opacity:0.85}}>
                    <PlaneShape cat={cat} color={col} fc={0.7}/>
                  </svg>
                  <div>
                    <div style={{fontSize:13,fontFamily:"'Orbitron',monospace",fontWeight:700,
                      color:col,letterSpacing:'.1em'}}>{e.type==='UNKN'?'????':e.type}</div>
                    <div style={{fontSize:9,color:'#5a7888',fontFamily:"'Exo 2',sans-serif",marginTop:1}}>
                      {catLabel(cat)} · {e.tails.length} tail{e.tails.length!==1?'s':''}</div>
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:11,color:'#6a98b8',fontFamily:"'Orbitron',monospace",fontWeight:600}}>
                    {e.closestNmi} nmi</div>
                  <div style={{fontSize:8,color:'#2a4a58',fontFamily:"'Orbitron',monospace",marginTop:2}}>
                    {fmt(e.lastSeen)}</div>
                </div>
              </div>
              {/* Tail chips */}
              <div style={{display:'flex',flexWrap:'wrap',gap:4,paddingLeft:36}}>
                {e.tails.map(t=>(
                  <div key={t.key} style={{
                    padding:'2px 7px',borderRadius:3,
                    background:'rgba(77,184,255,0.05)',
                    border:`0.5px solid ${t.isNew?'rgba(45,255,180,0.3)':'rgba(77,184,255,0.15)'}`,
                    fontSize:9,fontFamily:"'Orbitron',monospace",
                    color:t.isNew?'#2dffb4':'#5a8898',
                    whiteSpace:'nowrap',
                  }}>
                    {t.reg||t.cs}
                    <span style={{color:'#2a4060',marginLeft:5}}>{t.closestNmi}nm</span>
                    {t.timestamp&&<div style={{fontSize:7,color:'#2a4a5a',marginTop:1,letterSpacing:'.02em'}}>{fmtTime(t.timestamp)}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DualSlider — two native <input type="range"> overlaid on one track ──
// Uses real browser range inputs (iOS-native touch handling, no pointer hacks)
function DualSlider({ min, max, step, lo, hi, onLo, onHi }) {
  const loPct = ((lo - min) / (max - min)) * 100;
  const hiPct = ((hi - min) / (max - min)) * 100;
  const trackStyle = {
    position:'absolute',inset:0,
    WebkitAppearance:'none',appearance:'none',
    background:'transparent',outline:'none',
    pointerEvents:'none',cursor:'pointer',
    height:'100%',width:'100%',margin:0,padding:0,
  };
  return (
    <div style={{position:'relative',height:28,margin:'2px 0 8px'}}>
      {/* Track background + active fill */}
      <div style={{position:'absolute',left:0,right:0,top:'50%',transform:'translateY(-50%)',
        height:4,background:'#060e1e',borderRadius:2,pointerEvents:'none'}}>
        <div style={{position:'absolute',left:`${loPct}%`,width:`${hiPct-loPct}%`,
          top:0,bottom:0,background:'#4db8ff',borderRadius:2}}/>
      </div>
      {/* Lo handle — only responds to drags below the midpoint */}
      <input type="range" min={min} max={max} step={step} value={lo}
        onChange={e=>{const v=+e.target.value; if(v<hi) onLo(v);}}
        style={{...trackStyle, pointerEvents:'all',
          zIndex: lo > hi - (max-min)*0.08 ? 2 : 1}}/>
      {/* Hi handle — sits on top, only responds above midpoint */}
      <input type="range" min={min} max={max} step={step} value={hi}
        onChange={e=>{const v=+e.target.value; if(v>lo) onHi(v);}}
        style={{...trackStyle, pointerEvents:'all', zIndex:1}}/>
    </div>
  );
}

// ── RingRangeControl — circular dial on main screen ──────────────
// 270° sweep: 12 o'clock = NO LIMIT, 9 o'clock = min range
// Clockwise drag = reduce range
function RingRangeControl({ value, min=10, max, onChange }) {
  const svgRef = React.useRef(null);
  const S=72, cx=36, cy=36, r=27;
  const frac = (value-min)/(max-min);
  // Arc: 10:30 o'clock (SVG 225°) = max range → clockwise 315° → 9 o'clock (SVG 180°) = min range
  // Dead zone: only 45° from 9→10:30 (upper-left of circle, in the corner away from thumb)
  const S_DEG=225, E_DEG=180, SWEEP=315;
  const handleDeg = (S_DEG + (1-frac)*SWEEP) % 360;
  const hRad = handleDeg*Math.PI/180;
  const hx = cx + r*Math.cos(hRad);
  const hy = cy + r*Math.sin(hRad);

  // SVG arc path between two angles (clockwise sweep)
  const arc = (a1,a2) => {
    const r1=a1*Math.PI/180, r2=a2*Math.PI/180;
    const x1=cx+r*Math.cos(r1), y1=cy+r*Math.sin(r1);
    const x2=cx+r*Math.cos(r2), y2=cy+r*Math.sin(r2);
    const span=((a2-a1)+360)%360;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r},0,${span>180?1:0},1,${x2.toFixed(2)},${y2.toFixed(2)}`;
  };

  const angleToValue = angle => {
    // Clockwise sweep from S_DEG (225°)
    const sweep = ((angle - S_DEG) + 360) % 360;
    if(sweep > SWEEP) return sweep < SWEEP+(360-SWEEP)/2 ? min : max; // dead zone snap
    const f = 1 - sweep/SWEEP;
    return Math.round(Math.max(min, Math.min(max, min+f*(max-min)))/10)*10;
  };

  const startDrag = e => {
    e.preventDefault();
    e.stopPropagation();
    const move = ev => {
      if(!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const cx2 = rect.left+rect.width/2, cy2 = rect.top+rect.height/2;
      const clientX = ev.clientX??ev.touches?.[0]?.clientX??0;
      const clientY = ev.clientY??ev.touches?.[0]?.clientY??0;
      onChange(angleToValue(Math.atan2(clientY-cy2, clientX-cx2)*180/Math.PI));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    move(e);
  };

  const bgPath     = arc(S_DEG, E_DEG);  // 315° background track
  // Active arc from handle clockwise to E_DEG (9 o'clock)
  const activeSpan = ((E_DEG - handleDeg) + 360) % 360;
  const activePath = activeSpan > 1 ? arc(handleDeg, E_DEG) : null;

  return (
    <svg ref={svgRef} width={S} height={S} viewBox={`0 0 ${S} ${S}`}
      onPointerDown={startDrag}
      style={{cursor:'grab',touchAction:'none',display:'block',overflow:'visible'}}>
      {/* Track */}
      <path d={bgPath} fill="none" stroke="rgba(77,184,255,0.12)" strokeWidth="5" strokeLinecap="round"/>
      {/* Active arc — represents remaining display range */}
      {activePath&&<path d={activePath} fill="none" stroke="#4db8ff" strokeWidth="5"
        strokeLinecap="round" opacity="0.82"/>}
      {/* Handle */}
      <circle cx={hx} cy={hy} r="6" fill="#4db8ff" stroke="#010a18" strokeWidth="2"/>
      {/* Center — value */}
      <text x={cx} y={cy-4} textAnchor="middle" dominantBaseline="middle"
        fontSize="11" fontWeight="700" fill="#4db8ff"
        fontFamily="Orbitron,monospace" letterSpacing="-0.5">
        {value>=max?'∞':value}
      </text>
      <text x={cx} y={cy+7} textAnchor="middle" dominantBaseline="middle"
        fontSize="7" fill="rgba(77,184,255,0.45)" fontFamily="Orbitron,monospace">
        {value>=max?'FULL':'NMI'}
      </text>
      {/* Label below dead-zone gap */}
      <text x={cx} y={S-3} textAnchor="middle"
        fontSize="6.5" fill="rgba(77,184,255,0.28)" fontFamily="Orbitron,monospace" letterSpacing=".1em">
        RANGE
      </text>
    </svg>
  );
}

// ── FilterPanel ────────────────────────────────────────────────
const SPD_MAX=700, DIST_MAX=400;

function FilterPanel({
  altFloor,altCeiling,onFloor,onCeiling,
  search,onSearch,allFlights,pos,onSelect,
  typeFilter,onTypeFilter,
  minSpeedKts,maxSpeedKts,onMinSpd,onMaxSpd,
  maxDisplayNmi,onMaxDist,
  onResetAll,onClose,
}) {
  const results=search.trim().length>=2
    ?allFlights.filter(f=>f.cs.toUpperCase().includes(search.toUpperCase())).slice(0,5):[];

  // Compact helpers
  const Divider = () => <div style={{height:1,background:'rgba(77,184,255,0.07)',margin:'8px 0'}}/>;
  const Row = ({label,value,reset,onReset}) => (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
      <span style={{fontSize:9,color:'#60a0c0',fontFamily:"'Orbitron',monospace",letterSpacing:'.12em'}}>{label}</span>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        {reset&&<span onClick={onReset} style={{fontSize:8,color:'#4a9ab8',fontFamily:"'Orbitron',monospace",cursor:'pointer',textDecoration:'underline'}}>RESET</span>}
        <span style={{fontSize:10,fontFamily:"'Orbitron',monospace",fontWeight:600,color:'#4db8ff'}}>{value}</span>
      </div>
    </div>
  );

  return (
    <div onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
      onClick={e=>e.stopPropagation()} style={{
        position:'absolute',inset:0,zIndex:40,
        background:'rgba(2,8,22,0.97)',
        display:'flex',flexDirection:'column',
      }}>
      {/* Scrollable body */}
      <div style={{overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'10px 14px 6px',flex:1}}>

        {/* ── Callsign search ── */}
        <div style={{position:'relative',marginBottom:results.length||search.trim().length>=2?4:8}}>
          <input type="text" value={search} onChange={e=>onSearch(e.target.value.toUpperCase())}
            placeholder="Search callsign…" style={{width:'100%',boxSizing:'border-box',
              background:'rgba(8,20,44,0.9)',border:'1px solid rgba(77,184,255,0.25)',
              borderRadius:6,padding:'7px 10px 7px 30px',color:'#b8e4ff',fontSize:12,
              fontFamily:"'Orbitron',monospace",letterSpacing:'.06em',outline:'none'}}/>
          <svg style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}
            width="12" height="12" viewBox="0 0 13 13">
            <circle cx="5" cy="5" r="4" stroke="#4a7898" strokeWidth="1.5" fill="none"/>
            <line x1="8.5" y1="8.5" x2="12" y2="12" stroke="#4a7898" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        {results.length>0&&(
          <div style={{borderRadius:6,overflow:'hidden',border:'0.5px solid rgba(77,184,255,0.12)',marginBottom:6}}>
            {results.map((f,i)=>{
              const dist=haversine(pos.lat,pos.lon,f.lat,f.lon);
              const bear=getBearing(pos.lat,pos.lon,f.lat,f.lon);
              const elev=getElev(dist,f.alt);
              return (<div key={f.id} onClick={()=>onSelect({...f,dist,bear,elev})} style={{
                padding:'7px 10px',cursor:'pointer',
                background:i%2===0?'rgba(6,16,38,0.95)':'rgba(4,12,30,0.95)',
                display:'flex',justifyContent:'space-between',alignItems:'center',
                borderBottom:'0.5px solid rgba(77,184,255,0.06)'}}>
                <div>
                  <div style={{fontSize:11,color:'#4db8ff',fontFamily:"'Orbitron',monospace",fontWeight:700}}>{f.cs}</div>
                  <div style={{fontSize:10,color:'#5a8898',fontFamily:"'Exo 2',sans-serif"}}>{f.airline}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:altColor(f.alt),fontFamily:"'Orbitron',monospace",fontWeight:600}}>{mToFt(f.alt)} ft</div>
                  <div style={{fontSize:9,color:'#4a7888',fontFamily:"'Orbitron',monospace"}}>{distNmi(dist)} nmi</div>
                </div>
              </div>);
            })}
          </div>
        )}
        {search.trim().length>=2&&results.length===0&&
          <div style={{fontSize:9,color:'#4a6878',fontFamily:"'Orbitron',monospace",marginBottom:6}}>NO MATCH</div>}

        <Divider/>

        {/* ── Aircraft type ── */}
        <div style={{display:'flex',gap:5,marginBottom:8}}>
          {[['ALL','all'],['COMMERCIAL','commercial'],['MILITARY','military']].map(([lbl,val])=>(
            <div key={val} onClick={()=>onTypeFilter(val)} style={{
              flex:1,textAlign:'center',padding:'5px 0',cursor:'pointer',borderRadius:5,
              background:typeFilter===val?'rgba(77,184,255,0.18)':'transparent',
              border:`1px solid ${typeFilter===val?'#4db8ff':'rgba(77,184,255,0.18)'}`,
              fontSize:9,color:typeFilter===val?'#4db8ff':'#4a7888',
              fontFamily:"'Orbitron',monospace",fontWeight:typeFilter===val?600:400,
            }}>{lbl}</div>
          ))}
        </div>

        <Divider/>

        {/* ── Altitude — dual handle ── */}
        <Row label="ALTITUDE"
          value={`${altFloor===0?'GND':`${(altFloor/1000).toFixed(0)}k`} — ${altCeiling>=ALT_MAX?'∞':`${(altCeiling/1000).toFixed(0)}k`} ft`}
          reset={altFloor>0||altCeiling<ALT_MAX} onReset={()=>{onFloor(0);onCeiling(ALT_MAX);}}/>
        <DualSlider min={0} max={ALT_MAX} step={1000}
          lo={altFloor} hi={altCeiling} onLo={onFloor} onHi={onCeiling}/>

        <Divider/>

        {/* ── Speed — dual handle ── */}
        <Row label="SPEED"
          value={`${minSpeedKts===0?'0':minSpeedKts} — ${maxSpeedKts>=SPD_MAX?'∞':maxSpeedKts} kts`}
          reset={minSpeedKts>0||maxSpeedKts<SPD_MAX} onReset={()=>{onMinSpd(0);onMaxSpd(SPD_MAX);}}/>
        <DualSlider min={0} max={SPD_MAX} step={10}
          lo={minSpeedKts} hi={maxSpeedKts} onLo={onMinSpd} onHi={onMaxSpd}/>


      </div>{/* end scrollable body */}

      {/* Compact footer */}
      <div style={{padding:'7px 12px 10px',borderTop:'1px solid rgba(77,184,255,0.08)',display:'flex',gap:6}}>
        <button onClick={onResetAll} style={{flex:1,background:'transparent',
          border:'1px solid rgba(255,100,80,0.22)',borderRadius:5,color:'#6a4040',
          padding:'6px',fontFamily:"'Orbitron',monospace",fontSize:8,cursor:'pointer',letterSpacing:'.08em'}}>
          RESET ALL
        </button>
        <button onClick={onClose} style={{flex:2,background:'transparent',
          border:'1px solid rgba(77,184,255,0.15)',borderRadius:5,color:'#5a8898',
          padding:'6px',fontFamily:"'Orbitron',monospace",fontSize:9,cursor:'pointer'}}>
          DONE
        </button>
      </div>
    </div>
  );
}

const FilterIcon=({active})=>(
  <svg width="13" height="11" viewBox="0 0 13 11">
    <rect x="0"   y="0"   width="13" height="1.5" rx="0.75" fill={active?'#4db8ff':'#4a7898'}/>
    <rect x="1.5" y="4"   width="10" height="1.5" rx="0.75" fill={active?'#4db8ff':'#4a7898'}/>
    <rect x="3.5" y="8"   width="6"  height="1.5" rx="0.75" fill={active?'#4db8ff':'#4a7898'}/>
  </svg>
);

const STYLES=[
  "@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&family=Exo+2:wght@300;400;500&display=swap');",
  "@keyframes ring{0%{transform:translate(-50%,-50%) scale(.7);opacity:.75}100%{transform:translate(-50%,-50%) scale(2.8);opacity:0}}",
  "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}",
  "@keyframes slideUp{from{transform:translateY(105%)}to{transform:translateY(0)}}",
  "@keyframes taglineFade{0%{opacity:1}70%{opacity:1}100%{opacity:0}}",
  "@keyframes slideDown{from{transform:translateY(-8%);opacity:0}to{transform:translateY(0);opacity:1}}",
  "@keyframes sweep{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}",
  "@keyframes arPulse{0%,100%{box-shadow:0 0 6px #4db8ff44}50%{box-shadow:0 0 14px #4db8ffaa}}",
"@keyframes ping{0%{transform:translate(-50%,-50%) scale(.9);opacity:.85}100%{transform:translate(-50%,-50%) scale(3.2);opacity:0}}",
  "input[type=range]{-webkit-appearance:none;width:100%;height:3px;border-radius:2px;outline:none;cursor:pointer}",
  "input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#4db8ff;border:2.5px solid #010a18;cursor:grab;box-shadow:0 0 0 3px rgba(77,184,255,0.14);margin-top:-7px}",
  "input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#4db8ff;border:2.5px solid #010a18;cursor:grab}",
  "input[type=range]::-webkit-slider-runnable-track{background:transparent;height:3px}",
  "input[type=range]::-moz-range-track{background:transparent;height:3px}",
  "input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#4db8ff;border:2px solid #010a18;cursor:pointer;box-shadow:0 0 6px #4db8ff44}",
  "input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#4db8ff;border:2px solid #010a18;cursor:pointer}",
].join("\n");

// ── App ────────────────────────────────────────────────────────

// ── Disclaimer ─────────────────────────────────────────────────
const DISCLAIMER_KEY = 'soratomo_disclaimer_v1';
function Disclaimer({ onAccept }) {
  return (
    <div style={{
      position:'fixed',inset:0,zIndex:999,
      background:'rgba(1,6,18,0.98)',
      display:'flex',flexDirection:'column',
      fontFamily:"'Exo 2',sans-serif",
    }}>
      {/* Scrollable content area — fills all space above the pinned button */}
      <div style={{
        flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',
        padding:'28px 20px 16px',
        display:'flex',flexDirection:'column',alignItems:'center',
      }}>
        <div style={{maxWidth:480,width:'100%'}}>
          {/* Logo */}
          <div style={{textAlign:'center',marginBottom:18}}>
            <div style={{fontSize:22,fontFamily:"'Orbitron',monospace",fontWeight:700,
              color:'#b8e4ff',letterSpacing:'.25em'}}>SORATOMO</div>
            <div style={{fontSize:9,color:'#4a7898',fontFamily:"'Orbitron',monospace",
              letterSpacing:'.18em',marginTop:4}}>空友 · SKY COMPANION</div>
            <div style={{fontSize:13,color:'#7aacc8',fontFamily:"'Exo 2',sans-serif",
              fontStyle:'italic',marginTop:8,letterSpacing:'.04em'}}>Skygazing, for aircraft.</div>
          </div>

          {/* Disclaimer box */}
          <div style={{
            border:'1px solid rgba(77,184,255,0.25)',borderRadius:10,
            padding:'14px 16px',marginBottom:8,
            background:'rgba(4,14,36,0.9)',
          }}>
            <div style={{fontSize:11,fontFamily:"'Orbitron',monospace",fontWeight:700,
              color:'#e87070',letterSpacing:'.14em',marginBottom:10,textAlign:'center'}}>
              ⚠ DISCLAIMER — READ BEFORE USE
            </div>
            {[
              ['NOT FOR AVIATION USE',
               'A hobbyist tool for personal, recreational, and educational use ONLY. Not certified or intended for any aviation safety, navigation, or operational purpose.'],
              ['NO SAFETY GUARANTEE',
               'Do NOT use for aircraft separation, collision avoidance, airspace management, or any real-time flight operation. Provides NO safety assurance.'],
              ['DATA ACCURACY & LATENCY',
               'ADS-B data from adsb.lol may be delayed, incomplete, or absent. Aircraft without ADS-B transponders will NOT appear. Coverage not guaranteed.'],
              ['REGULATORY COMPLIANCE',
               'Users are solely responsible for complying with all aviation regulations. This app does not provide airspace authorization, NOTAMs, weather, or TFR information.'],
              ['LIMITATION OF LIABILITY',
               'The developer assumes NO liability for any injury, damage, or loss arising from use of this application. Use is entirely at your own risk.'],
              ['NO ENDORSEMENT',
               'Not affiliated with or approved by the FAA, ICAO, or any aviation regulatory body.'],
            ].map(([title, body]) => (
              <div key={title} style={{marginBottom:9}}>
                <div style={{fontSize:9,fontFamily:"'Orbitron',monospace",fontWeight:700,
                  color:'#4db8ff',letterSpacing:'.1em',marginBottom:2}}>{title}</div>
                <div style={{fontSize:10,color:'#7a9ab8',lineHeight:1.5}}>{body}</div>
              </div>
            ))}
          </div>

          {/* Scroll hint — only visible if content overflows */}
          <div style={{textAlign:'center',fontSize:9,color:'#2a4050',
            fontFamily:"'Orbitron',monospace",letterSpacing:'.06em',marginBottom:4}}>
            ↓ scroll to accept
          </div>
        </div>
      </div>

      {/* Accept button — pinned to bottom, always visible on any screen size */}
      <div style={{
        padding:'12px 20px 28px',
        background:'linear-gradient(0deg,rgba(1,6,18,1) 70%,rgba(1,6,18,0) 100%)',
        flexShrink:0,
      }}>
        <button onClick={onAccept} style={{
          width:'100%',padding:'15px',
          background:'rgba(77,184,255,0.1)',
          border:'1.5px solid #4db8ff',
          borderRadius:8,cursor:'pointer',
          fontFamily:"'Orbitron',monospace",
          fontSize:11,fontWeight:700,
          color:'#4db8ff',letterSpacing:'.15em',
        }}>
          I UNDERSTAND — ENTERTAINMENT ONLY
        </button>
        <div style={{textAlign:'center',marginTop:8,fontSize:9,color:'#2a4a58',
          fontFamily:"'Orbitron',monospace",letterSpacing:'.08em'}}>
          Shown once per session · v1
        </div>
      </div>
    </div>
  );
}

// ── Stats ───────────────────────────────────────────────────────
function Stats({ entries, onClose }) {
  const [detail, setDetail] = React.useState(null); // logbook entry tapped for detail

  const totalTails  = entries.reduce((s,e)=>s+e.tails.length,0);
  const totalTypes  = entries.length;
  const allTails    = entries.flatMap(e=>e.tails);
  const closestEver = allTails.length
    ? Math.min(...allTails.map(t=>t.closestNmi)).toFixed(1)
    : '—';
  const firstEver  = allTails.length ? Math.min(...allTails.map(t=>t.timestamp||Infinity)) : null;
  const latestEver = allTails.length ? Math.max(...allTails.map(t=>t.timestamp||0)) : null;

  const rarest  = entries.length
    ? [...entries].sort((a,b)=>a.tails.length-b.tails.length||b.lastSeen-a.lastSeen)[0]
    : null;
  const mostSeen = entries.length
    ? [...entries].sort((a,b)=>b.tails.length-a.tails.length)[0]
    : null;

  const catOrder  = ['narrow','wide','super','jumbo','regional','bizjet','military',''];
  const catNames  = {narrow:'Narrowbody',wide:'Widebody',super:'Superjumbo',
    jumbo:'Jumbo',regional:'Regional Jet',bizjet:'Business Jet',military:'Military',helicopter:'Helicopter',piston:'Piston/GA',milTransport:'Mil Transport','':'Unknown'};
  const catCounts = {};
  entries.forEach(e=>{
    const c=e.cat||getAircraftCat(e.type!=='UNKN'?e.type:'');
    catCounts[c]=(catCounts[c]||0)+e.tails.length;
  });
  const maxCat = Math.max(1,...Object.values(catCounts));
  const catRows = catOrder.filter(c=>catCounts[c]>0);

  const Big = ({val,label,sub}) => (
    <div style={{background:'rgba(4,14,36,0.9)',border:'1px solid rgba(77,184,255,0.15)',
      borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
      <div style={{fontSize:22,fontFamily:"'Orbitron',monospace",fontWeight:700,
        color:'#b8e4ff',letterSpacing:'.04em',lineHeight:1}}>{val}</div>
      <div style={{fontSize:8,color:'#4db8ff',fontFamily:"'Orbitron',monospace",
        letterSpacing:'.12em',marginTop:4}}>{label}</div>
      {sub&&<div style={{fontSize:8,color:'#3a6878',fontFamily:"'Exo 2',sans-serif",marginTop:2}}>{sub}</div>}
    </div>
  );

  // ── Detail view for a specific type entry ───────────────────────
  if(detail) {
    const cat = detail.cat||getAircraftCat(detail.type!=='UNKN'?detail.type:'');
    const col = altColor(Math.max(...detail.tails.map(t=>t.alt))/3.28084);
    const catLabel = catNames[cat]||'Aircraft';
    return (
      <div onClick={e=>e.stopPropagation()} style={{
        position:'absolute',inset:0,zIndex:65,
        background:'rgba(1,6,18,0.99)',
        display:'flex',flexDirection:'column',
        animation:'slideUp 0.25s ease',fontFamily:"'Exo 2',sans-serif",
      }}>
        {/* Header */}
        <div style={{padding:'14px 16px 12px',borderBottom:'1px solid rgba(77,184,255,0.12)',flexShrink:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <button onClick={()=>setDetail(null)} style={{background:'transparent',
              border:'1px solid rgba(77,184,255,0.2)',borderRadius:6,color:'#5a8898',
              fontSize:11,cursor:'pointer',padding:'4px 10px',fontFamily:"'Orbitron',monospace"}}>
              ← BACK
            </button>
            <button onClick={onClose} style={{background:'transparent',
              border:'1px solid rgba(77,184,255,0.2)',borderRadius:6,color:'#5a8898',
              fontSize:12,cursor:'pointer',padding:'4px 10px',fontFamily:"'Orbitron',monospace"}}>
              X CLOSE
            </button>
          </div>
          {/* Type hero */}
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <svg width="40" height="40" viewBox="-12 -12 24 24" style={{flexShrink:0}}>
              <PlaneShape cat={cat} color={col} fc={0.7}/>
            </svg>
            <div>
              <div style={{fontSize:20,fontFamily:"'Orbitron',monospace",fontWeight:700,
                color:col,letterSpacing:'.1em'}}>{detail.type==='UNKN'?'????':detail.type}</div>
              <div style={{fontSize:10,color:'#5a8898',fontFamily:"'Exo 2',sans-serif",marginTop:2}}>
                {catLabel}
                {detail.owner&&<span style={{color:'#4a7888'}}> · {detail.owner}</span>}
              </div>
              <div style={{fontSize:9,color:'#3a5868',fontFamily:"'Orbitron',monospace",marginTop:3,letterSpacing:'.06em'}}>
                {detail.tails.length} UNIQUE TAIL{detail.tails.length!==1?'S':''} LOGGED
              </div>
            </div>
          </div>
        </div>

        {/* Tail list */}
        <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'6px 0'}}>
          {[...detail.tails].sort((a,b)=>a.closestNmi-b.closestNmi).map(t=>(
            <div key={t.key} style={{padding:'11px 16px',
              borderBottom:'0.5px solid rgba(77,184,255,0.07)'}}>
              {/* Tail header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{fontSize:13,fontFamily:"'Orbitron',monospace",fontWeight:700,
                    color:t.isNew?'#2dffb4':'#b8e4ff',letterSpacing:'.08em'}}>{t.reg||t.cs}</div>
                  {t.isNew&&<div style={{fontSize:8,background:'rgba(45,255,180,0.1)',
                    border:'1px solid #2dffb433',borderRadius:3,padding:'1px 4px',
                    color:'#2dffb4',fontFamily:"'Orbitron',monospace"}}>FIRST</div>}
                </div>
                <div style={{fontSize:8,color:'#2a4a58',fontFamily:"'Orbitron',monospace"}}>
                  {fmtTime(t.timestamp)}
                </div>
              </div>
              {/* Stats grid */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4,marginBottom:4}}>
                {[
                  ['CLOSEST',  t.closestNmi+' nmi'],
                  ['ALTITUDE', (t.alt||0).toLocaleString()+' ft'],
                  ['SPEED',    (t.spd||0)+' kts'],
                  ['HEADING',  (t.hdg!=null?t.hdg.toString().padStart(3,'0'):'---')+'°'],
                  ['CALLSIGN', t.cs||'—'],
                  ['AIRLINE',  t.airline||'—'],
                ].map(([lbl,val])=>(
                  <div key={lbl} style={{background:'rgba(4,14,36,0.7)',borderRadius:4,padding:'4px 6px'}}>
                    <div style={{fontSize:7,color:'#2a5a6a',fontFamily:"'Orbitron',monospace",letterSpacing:'.08em'}}>{lbl}</div>
                    <div style={{fontSize:9,color:'#7aaabb',fontFamily:"'Orbitron',monospace",marginTop:1,fontWeight:600}}>{val}</div>
                  </div>
                ))}
              </div>
              {/* Location */}
              <div style={{fontSize:8,color:'#3a6878',fontFamily:"'Orbitron',monospace",letterSpacing:'.04em'}}>
                📍 {t.city||'Unknown'}
                {t.lat&&t.lon&&<span style={{color:'#2a4050',marginLeft:6}}>
                  {t.lat.toFixed(2)}° {t.lon.toFixed(2)}°
                </span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Main stats view ──────────────────────────────────────────────
  return (
    <div onClick={e=>e.stopPropagation()} style={{
      position:'absolute',inset:0,zIndex:60,
      background:'rgba(1,6,18,0.98)',
      display:'flex',flexDirection:'column',
      animation:'slideUp 0.3s ease',
    }}>
      <div style={{padding:'14px 16px 10px',borderBottom:'1px solid rgba(77,184,255,0.12)',flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:12,fontFamily:"'Orbitron',monospace",fontWeight:700,
            color:'#b8e4ff',letterSpacing:'.18em'}}>SPOTTING STATS</div>
          <button onClick={onClose} style={{background:'transparent',border:'1px solid rgba(77,184,255,0.2)',
            borderRadius:6,color:'#5a8898',fontSize:12,cursor:'pointer',padding:'4px 10px',
            fontFamily:"'Orbitron',monospace"}}>X CLOSE</button>
        </div>
        {firstEver&&<div style={{fontSize:9,color:'#3a6878',fontFamily:"'Orbitron',monospace",
          letterSpacing:'.06em',marginTop:4}}>
          SINCE {fmtTime(firstEver).split(' ').slice(0,2).join(' ')}
        </div>}
      </div>

      <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'14px 16px'}}>
        {totalTails===0?(
          <div style={{textAlign:'center',padding:'48px 20px',color:'#3a6878',
            fontSize:11,fontFamily:"'Orbitron',monospace",lineHeight:2,letterSpacing:'.08em'}}>
            NO DATA YET<br/>
            <span style={{fontSize:10,color:'#2a4a58'}}>LOG SOME AIRCRAFT FIRST</span>
          </div>
        ):(
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
              <Big val={totalTails}  label="TOTAL TAILS"   sub={`${totalTypes} type${totalTypes!==1?'s':''}`}/>
              <Big val={closestEver+' nmi'} label="CLOSEST EVER" sub={latestEver?'last: '+fmtTime(latestEver):undefined}/>
            </div>

            {rarest&&(
              <div onClick={()=>setDetail(rarest)} style={{
                background:'rgba(4,14,36,0.9)',border:'1px solid rgba(45,255,180,0.2)',
                borderRadius:8,padding:'10px 14px',marginBottom:8,
                display:'flex',justifyContent:'space-between',alignItems:'center',
                cursor:'pointer',WebkitTapHighlightColor:'rgba(45,255,180,0.08)'}}>
                <div>
                  <div style={{fontSize:9,color:'#4db8ff',fontFamily:"'Orbitron',monospace",
                    letterSpacing:'.12em',marginBottom:4}}>RAREST CATCH <span style={{color:'#2a4a5a'}}>↗ TAP FOR DETAIL</span></div>
                  <div style={{fontSize:16,fontFamily:"'Orbitron',monospace",fontWeight:700,
                    color:'#2dffb4'}}>{rarest.type==='UNKN'?'????':rarest.type}</div>
                  <div style={{fontSize:9,color:'#5a7888',fontFamily:"'Exo 2',sans-serif",marginTop:2}}>
                    {rarest.tails.length} sighting{rarest.tails.length!==1?'s':''}
                    {rarest.tails[0]?.reg?' · '+rarest.tails[0].reg:''}
                  </div>
                </div>
                <svg width="32" height="32" viewBox="-12 -12 24 24" style={{opacity:0.85,flexShrink:0}}>
                  <PlaneShape cat={rarest.cat||getAircraftCat(rarest.type!=='UNKN'?rarest.type:'')}
                    color="#2dffb4" fc={0.7}/>
                </svg>
              </div>
            )}
            {mostSeen&&mostSeen!==rarest&&(
              <div onClick={()=>setDetail(mostSeen)} style={{
                background:'rgba(4,14,36,0.9)',border:'1px solid rgba(77,184,255,0.12)',
                borderRadius:8,padding:'10px 14px',marginBottom:14,
                display:'flex',justifyContent:'space-between',alignItems:'center',
                cursor:'pointer',WebkitTapHighlightColor:'rgba(77,184,255,0.08)'}}>
                <div>
                  <div style={{fontSize:9,color:'#4db8ff',fontFamily:"'Orbitron',monospace",
                    letterSpacing:'.12em',marginBottom:4}}>MOST SEEN <span style={{color:'#2a4a5a'}}>↗ TAP FOR DETAIL</span></div>
                  <div style={{fontSize:16,fontFamily:"'Orbitron',monospace",fontWeight:700,
                    color:'#e8f4ff'}}>{mostSeen.type==='UNKN'?'????':mostSeen.type}</div>
                  <div style={{fontSize:9,color:'#5a7888',fontFamily:"'Exo 2',sans-serif",marginTop:2}}>
                    {mostSeen.tails.length} unique tails logged
                  </div>
                </div>
                <svg width="32" height="32" viewBox="-12 -12 24 24" style={{opacity:0.85,flexShrink:0}}>
                  <PlaneShape cat={mostSeen.cat||getAircraftCat(mostSeen.type!=='UNKN'?mostSeen.type:'')}
                    color="#e8f4ff" fc={0.7}/>
                </svg>
              </div>
            )}

            <div style={{fontSize:9,color:'#4db8ff',fontFamily:"'Orbitron',monospace",
              letterSpacing:'.12em',marginBottom:8}}>BY CATEGORY</div>
            {catRows.map(c=>(
              <div key={c} style={{marginBottom:6}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                  <span style={{fontSize:9,color:'#7aacb8',fontFamily:"'Exo 2',sans-serif"}}>{catNames[c]}</span>
                  <span style={{fontSize:9,color:'#4a8898',fontFamily:"'Orbitron',monospace"}}>{catCounts[c]}</span>
                </div>
                <div style={{height:5,background:'rgba(77,184,255,0.08)',borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',borderRadius:3,
                    background:c==='military'?'#e879f9':c==='bizjet'?'#2dffb4':'#4db8ff',
                    width:`${(catCounts[c]/maxCat)*100}%`,
                    transition:'width 0.4s ease'}}/>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Gallery ─────────────────────────────────────────────────────
function Gallery({ photos, onClose, onDelete, onClear, selected, onSelect }) {
  const fmt = fmtTime;
  if(selected) return (
    <div onClick={()=>onSelect(null)} style={{
      position:'absolute',inset:0,zIndex:70,
      background:'#000',
      display:'flex',flexDirection:'column',
      animation:'slideUp 0.2s ease',
    }}>
      <img src={selected.thumb} alt=""
        style={{flex:1,width:'100%',objectFit:'contain'}}/>
      <div style={{padding:'10px 14px',background:'rgba(1,6,18,0.95)',
        display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div>
          <div style={{fontSize:10,fontFamily:"'Orbitron',monospace",color:'#b8e4ff',letterSpacing:'.08em'}}>
            {selected.heading.toString().padStart(3,'0')}° · {selected.count} A/C
          </div>
          <div style={{fontSize:8,color:'#3a6878',fontFamily:"'Orbitron',monospace",marginTop:2}}>
            {fmt(selected.timestamp)}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={e=>{e.stopPropagation();
            const a=document.createElement('a');
            a.download=`soratomo-${selected.id}.jpg`;
            a.href=selected.thumb;
            document.body.appendChild(a);a.click();document.body.removeChild(a);
          }} style={{background:'rgba(77,184,255,0.1)',border:'1px solid rgba(77,184,255,0.3)',
            borderRadius:6,padding:'6px 12px',cursor:'pointer',color:'#4db8ff',
            fontSize:9,fontFamily:"'Orbitron',monospace"}}>↓ SAVE</button>
          <button onClick={e=>{e.stopPropagation();onDelete(selected.id);onSelect(null);}}
            style={{background:'rgba(255,100,100,0.1)',border:'1px solid rgba(255,100,100,0.3)',
            borderRadius:6,padding:'6px 12px',cursor:'pointer',color:'#f87171',
            fontSize:9,fontFamily:"'Orbitron',monospace"}}>DELETE</button>
        </div>
      </div>
    </div>
  );

  return (
    <div onClick={e=>e.stopPropagation()} style={{
      position:'absolute',inset:0,zIndex:60,
      background:'rgba(1,6,18,0.98)',
      display:'flex',flexDirection:'column',
      animation:'slideUp 0.3s ease',
    }}>
      {/* Header */}
      <div style={{padding:'14px 16px 10px',borderBottom:'1px solid rgba(77,184,255,0.12)',
        flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:12,fontFamily:"'Orbitron',monospace",fontWeight:700,
            color:'#b8e4ff',letterSpacing:'.18em'}}>SNAP GALLERY</div>
          <div style={{fontSize:9,color:'#3a6878',fontFamily:"'Orbitron',monospace",
            marginTop:3,letterSpacing:'.06em'}}>{photos.length} PHOTO{photos.length!==1?'S':''} · TAP TO ENLARGE</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {photos.length>0&&(
            <button onClick={onClear} style={{background:'transparent',
              border:'1px solid rgba(255,100,100,0.3)',borderRadius:6,padding:'4px 10px',
              cursor:'pointer',color:'#f87171',fontSize:9,fontFamily:"'Orbitron',monospace"}}>
              CLEAR ALL
            </button>
          )}
          <button onClick={onClose} style={{background:'transparent',
            border:'1px solid rgba(77,184,255,0.2)',borderRadius:6,padding:'4px 10px',
            cursor:'pointer',color:'#5a8898',fontSize:12,fontFamily:"'Orbitron',monospace"}}>
            X CLOSE
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch'}}>
        {photos.length===0 ? (
          <div style={{textAlign:'center',padding:'60px 20px',color:'#3a6878',
            fontSize:11,fontFamily:"'Orbitron',monospace",lineHeight:2,letterSpacing:'.08em'}}>
            NO PHOTOS YET<br/>
            <span style={{fontSize:10,color:'#2a4a58'}}>TAP SNAP IN CAMERA MODE</span>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:3,padding:3}}>
            {photos.map(p=>(
              <div key={p.id} onClick={()=>onSelect(p)} style={{
                position:'relative',aspectRatio:'16/9',
                overflow:'hidden',borderRadius:4,cursor:'pointer',
                background:'#0a1428',
              }}>
                <img src={p.thumb} alt={fmt(p.timestamp)}
                  style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                <div style={{position:'absolute',bottom:0,left:0,right:0,
                  background:'linear-gradient(transparent,rgba(1,6,18,0.85))',
                  padding:'8px 4px 3px',
                  fontSize:6.5,color:'rgba(184,228,255,0.8)',fontFamily:"'Orbitron',monospace",
                  letterSpacing:'.03em',textAlign:'right'}}>
                  {p.heading.toString().padStart(3,'0')}° · {p.count}ac
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


export default function App() {
  const [pos,         setPos]         = useState({lat:38.9072,lon:-77.0369});
  const [heading,     setHeading]     = useState(15);
  const [devicePitch, setDevicePitch] = useState(0);
  const [flights,     setFlights]     = useState([]);
  const [apiStatus,   setApiStatus]   = useState('demo'); // 'live'|'demo'|'limited'
  const [selectedId,  setSelectedId]  = useState(null); // ID only — derive live data from mapped
  const [showHint,    setShowHint]    = useState(true);
  const [altFloor,    setAltFloor]    = useState(0);
  const [altCeiling,  setAltCeiling]  = useState(ALT_MAX);
  const [search,      setSearch]      = useState('');
  const [showDisclaimer,setShowDisclaimer]=useState(()=>!sessionStorage.getItem(DISCLAIMER_KEY));
  const [taglineOpacity, setTaglineOpacity]=useState(1); // 1→0 after 4s
  const [showFilters, setShowFilters] = useState(false);
  const [tiltMode,    setTiltMode]    = useState(false);
  const [arFov,       setArFov]       = useState(HFOV);
  const [scanHeading, setScanHeading] = useState(0);   // free-pan heading in scan mode
  const [scanPitch,   setScanPitch]   = useState(0);   // free-pan pitch in scan mode (-60..60)
  const [cameraMode,  setCameraMode]  = useState(false);
  const [captureFlash,setCaptureFlash]= useState(false); // white flash on capture
  const videoRef   = useRef(null);
  const streamRef  = useRef(null); // increments each fetch → resets sweep animation
  const [logbook,     setLogbook]     = useState(()=>loadLog());
  const [showLog,     setShowLog]     = useState(false);
  const [showStats,   setShowStats]   = useState(false);
  const [density,     setDensity]     = useState('compact'); // compact|normal
  const [camFov,      setCamFov]      = useState(()=>{try{return parseFloat(localStorage.getItem('soratomo_cam_fov')||'77');}catch{return 77;}});
  const [showCalib,   setShowCalib]   = useState(false);
  const [hdgBias,     setHdgBias]     = useState(()=>{try{return parseFloat(localStorage.getItem('soratomo_hdg_bias')||'0');}catch{return 0;}});
  const [pitchBias,   setPitchBias]   = useState(()=>{try{return parseFloat(localStorage.getItem('soratomo_pitch_bias')||'0');}catch{return 0;}});
  const [gallery,     setGallery]     = useState(()=>loadGallery());
  const [showGallery, setShowGallery] = useState(false);
  const [galSelected, setGalSelected] = useState(null); // enlarged photo
  const prevMappedRef = useRef(new Set());
  const [proximityNmi,setProximityNmi]= useState(()=>loadProx());
  const [toasts,      setToasts]      = useState([]);
  const [typeFilter,  setTypeFilter]  = useState('all');
  const [minSpeedKts, setMinSpeedKts] = useState(0);
  const [maxSpeedKts, setMaxSpeedKts] = useState(700);
  const [maxDisplayNmi,setMaxDisplayNmi]=useState(400);
  const [rangeNote,    setRangeNote]    = useState(null); // auto-range reduction notice
  const [showCoords,  setShowCoords]  = useState(false); // lat/lon toggle

  const dragRef          = useRef(null);
  const orientRef        = useRef(null);
  const pinchRef         = useRef(null);  // {dist, fov} — pinch-to-zoom state
  const activeEncounters = useRef(new Map());
  const historicTails    = useRef(new Set(loadLog().flatMap(e=>e.tails.map(t=>t.key))));
  const lastLoggedTime   = useRef(new Map());
  const saveLogTimer     = useRef(null); // debounce logbook writes
  const lastFetchMs      = useRef(Date.now()); // timestamp of last successful ADS-B fetch
  const demoAlerted      = useRef(false);       // prevent repeated demo banners
  // Dead-reckoning: extrapolate pos between GPS fixes using last known velocity
  const drVel           = useRef({speedMs:0, trackDeg:0}); // m/s + true track
  const drAnchor        = useRef(null);  // {lat,lon,ts} of last real GPS fix
  const drHeadingRef    = useRef(0);     // mirror of heading state for DR closure
  const posEMA          = useRef(null);   // EMA-smoothed / averaged user position
  const fixBuf          = useRef([]);     // rolling buffer of stationary GPS fixes for averaging
  const speedHist       = useRef([]);     // last 3 GPS speed readings — hysteresis for mode switch
  const typeCacheRef     = useRef(loadTypeCache()); // hex → {type,reg} | 'pending' | null — persisted to localStorage

  // Derived: all logged callsigns including this session
  const loggedCallsigns = useMemo(()=>new Set(logbook.map(e=>e.cs)),[logbook]);
  // loggedTypes: ICAO codes of all aircraft types ever logged — for red new-type ring
  const loggedTypes = useMemo(()=>new Set(logbook.map(e=>e.type)),[logbook]);

  useEffect(()=>{
    if(!navigator.geolocation) return;

    // Project a lat/lon forward by distance d (metres) along bearing b (degrees)
    const project = (lat, lon, b, d) => {
      const R = 6371000;
      const bR = b * D2R;
      const la = lat * D2R, lo = lon * D2R;
      const la2 = Math.asin(Math.sin(la)*Math.cos(d/R) + Math.cos(la)*Math.sin(d/R)*Math.cos(bR));
      const lo2 = lo + Math.atan2(Math.sin(bR)*Math.sin(d/R)*Math.cos(la), Math.cos(d/R)-Math.sin(la)*Math.sin(la2));
      return {lat: la2/D2R, lon: lo2/D2R};
    };

    // Rough distance in metres between two lat/lon points (equirectangular, fast)
    const roughM = (la1,lo1,la2,lo2) => {
      const dy=(la2-la1)*111320;
      const dx=(lo2-lo1)*111320*Math.cos(la1*D2R);
      return Math.sqrt(dx*dx+dy*dy);
    };

    // Position update strategy:
    //   STATIONARY (speed < 5 m/s):
    //     Buffer up to 12 GPS fixes and display their mean.
    //     Mean of N fixes reduces noise by √N — 12 fixes ≈ 3.5× better than one.
    //     Each new fix replaces the oldest, so the displayed position drifts
    //     by at most 1/12th of one fix per update — effectively frozen.
    //   MOVING (speed ≥ 5 m/s):
    //     Flush the buffer, switch to speed-adaptive EMA for responsive tracking.
    const BUF = 12;
    // isMoving uses a 3-reading hysteresis to prevent spurious mode switches.
    // GPS noise can report phantom speeds of 0–8 m/s on a stationary device;
    // requiring 3 consecutive readings above 12 m/s eliminates that entirely.
    const isMoving = speedMs => {
      speedHist.current.push(speedMs);
      if(speedHist.current.length > 3) speedHist.current.shift();
      return speedHist.current.length === 3 &&
             speedHist.current.every(s => s > 12);
    };
    const updatePos = (lat, lon, speedMs) => {
      if(!isMoving(speedMs)) {
        // Stationary — accumulate fixes; display running mean
        fixBuf.current.push({lat, lon});
        if(fixBuf.current.length > BUF) fixBuf.current.shift();
        const n = fixBuf.current.length;
        const avg = {
          lat: fixBuf.current.reduce((s,f)=>s+f.lat, 0)/n,
          lon: fixBuf.current.reduce((s,f)=>s+f.lon, 0)/n,
        };
        posEMA.current = avg;
        setPos({...avg});
      } else {
        // Moving (3 consecutive readings > 12 m/s) — flush buffer, use EMA
        if(fixBuf.current.length > 0) fixBuf.current = [];
        speedHist.current = []; // reset so transition back is clean
        const alpha = Math.min(0.85, Math.max(0.15, speedMs/60));
        if(!posEMA.current){ posEMA.current={lat,lon}; setPos({lat,lon}); return; }
        posEMA.current = {
          lat: posEMA.current.lat + alpha*(lat-posEMA.current.lat),
          lon: posEMA.current.lon + alpha*(lon-posEMA.current.lon),
        };
        setPos({...posEMA.current});
      }
    };

    // Called on every real GPS fix — filter bad fixes, update anchor, update pos
    const onFix = p => {
      const {latitude:lat, longitude:lon, speed, heading:gpsHdg, accuracy} = p.coords;
      const speedMs  = (speed  != null && speed  >= 0) ? speed  : drVel.current.speedMs;
      const trackDeg = (gpsHdg != null && gpsHdg >= 0) ? gpsHdg : drHeadingRef.current;

      // Accuracy gate — GPS: 5–20 m; WiFi: 50–500 m; Cell: 500–2000 m.
      // Stationary: reject anything >100 m accuracy (WiFi/cell fallback).
      if(speedMs < 12 && accuracy != null && accuracy > 80) return; // tighter gate — GPS <20m, WiFi >50m

      // Jump gate — reject >250 m jumps while slow (misreported accuracy)
      if(speedMs < 12 && posEMA.current &&
         roughM(posEMA.current.lat, posEMA.current.lon, lat, lon) > 150) return;

      drVel.current    = {speedMs, trackDeg};
      drAnchor.current = {lat, lon, ts: Date.now()};
      updatePos(lat, lon, speedMs);
    };

    // One-shot first fix — allow slightly stale so GPS (not WiFi) is used
    navigator.geolocation.getCurrentPosition(
      onFix, ()=>{}, {enableHighAccuracy:true, timeout:12000, maximumAge:5000}
    );
    // OS-driven watch — primary continuous source
    const wid = navigator.geolocation.watchPosition(
      onFix, ()=>{}, {enableHighAccuracy:true, timeout:20000, maximumAge:10000}
    );
    // Supplemental 15s poll — bypasses Safari throttling in flight.
    // maximumAge:20000 means "use a 20s-old GPS fix rather than fall back
    // to WiFi", preventing the WiFi-fallback jumps at the cost of slight staleness.
    const poll = setInterval(()=>{
      navigator.geolocation.getCurrentPosition(
        onFix, ()=>{}, {enableHighAccuracy:true, timeout:10000, maximumAge:20000}
      );
    }, 15000);

    // 1 Hz dead-reckoning extrapolation between GPS fixes.
    // Threshold raised to 5 m/s — GPS noise on a stationary device can report
    // 1-3 m/s spuriously, which was causing on-ground jitter at the old 1 m/s limit.
    const dr = setInterval(()=>{
      const anchor = drAnchor.current;
      if(!anchor || drVel.current.speedMs < 12) return; // 12 m/s ≈ 24 kts — only DR in actual flight
      const ageSec = (Date.now() - anchor.ts) / 1000;
      if(ageSec < 1 || ageSec > 60) return;
      const track  = drHeadingRef.current || drVel.current.trackDeg;
      const dist   = drVel.current.speedMs * ageSec;
      const extrap = project(anchor.lat, anchor.lon, track, dist);
      // DR positions are computed (not noisy) — apply with high alpha for smooth tracking
      updatePos(extrap.lat, extrap.lon, Math.max(drVel.current.speedMs, 30));
    }, 1000);

    return ()=>{
      navigator.geolocation.clearWatch(wid);
      clearInterval(poll);
      clearInterval(dr);
    };
  },[]);

  const registerOrientation = useCallback(()=>{
    if(orientRef.current) return;
    // ── Shared state ───────────────────────────────────────────────
    let rafId=null;
    let alpha=null, beta=null, webkit=null; // heading fields (any event can update)
    let smoothPitch=0, pitchInit=false;     // pitch fields (ONLY deviceorientation updates)
    let smoothHdg=0,   hdgInit=false;       // heading — circular EMA (avoids 0/360 wrap jump)

    let displayedPitch = 0;          // last value actually sent to React state
    const process=()=>{
      rafId=null;
      const rawHdg=(webkit!=null&&webkit>=0)?webkit:(360-(alpha||0)+360)%360;
      // Circular EMA: operate on shortest-arc delta to avoid 0°↔360° discontinuity
      if(!hdgInit){ smoothHdg=rawHdg; hdgInit=true; }
      else{ const d=((rawHdg-smoothHdg+540)%360)-180; smoothHdg=(smoothHdg+d*0.15+360)%360; }
      const hdgVal = Math.round(smoothHdg*10)/10;
      setHeading(hdgVal);
      drHeadingRef.current = hdgVal; // keep DR closure current
      if(beta!=null){
        const raw=Math.max(-60,Math.min(90,beta-90));
        // EMA (heavier smoothing) — seed on first reading, no snap-from-0
        smoothPitch = pitchInit ? smoothPitch*0.92 + raw*0.08 : raw;
        pitchInit   = true;
        // Dead-band: only push to React state when display value would change
        // Suppresses 60Hz re-renders from sub-1° noise
        const display = Math.round(smoothPitch);
        if(display !== displayedPitch || !pitchInit){
          displayedPitch = display;
          setDevicePitch(display);
        }
      }
    };

    // deviceorientation: primary — updates heading AND pitch (beta)
    // On iOS this fires with webkitCompassHeading so heading is already correct here.
    const hOrientation = e => {
      alpha  = e.alpha;
      beta   = e.beta;           // ONLY this handler may write beta
      webkit = e.webkitCompassHeading ?? null;
      if(!rafId) rafId = requestAnimationFrame(process);
    };

    // deviceorientationabsolute: secondary heading fallback for Android only.
    // NEVER writes beta — prevents competing-event pitch oscillation on iOS.
    const hAbsolute = e => {
      if(webkit == null) {       // only useful when iOS webkit compass unavailable
        alpha = e.alpha;
        if(!rafId) rafId = requestAnimationFrame(process);
      }
    };

    window.addEventListener('deviceorientation',         hOrientation);
    window.addEventListener('deviceorientationabsolute', hAbsolute);
    orientRef.current = { hOrientation, hAbsolute };
  },[]);

  useEffect(()=>()=>{
    if(orientRef.current){
      window.removeEventListener('deviceorientation',         orientRef.current.hOrientation);
      window.removeEventListener('deviceorientationabsolute', orientRef.current.hAbsolute);
    }
  },[]);

  // Attach camera stream to video element whenever cameraMode turns on
  useEffect(()=>{
    if(cameraMode && videoRef.current && streamRef.current){
      videoRef.current.srcObject=streamRef.current;
    }
    if(!cameraMode && streamRef.current){
      streamRef.current.getTracks().forEach(t=>t.stop());
      streamRef.current=null;
    }
  },[cameraMode]);

  const handleAircraftSelect = useCallback(fl=>{
    setSelectedId(prev=>prev===fl.id?null:fl.id);
  },[]);

  const handleARToggle = e => {
    e.stopPropagation(); setShowFilters(false);
    if(tiltMode){ setTiltMode(false); return; }
    const activate=()=>{ registerOrientation(); setTiltMode(true); };
    if(typeof window.DeviceOrientationEvent?.requestPermission==='function'){
      window.DeviceOrientationEvent.requestPermission().then(p=>{ if(p==='granted') activate(); }).catch(()=>{});
    } else { activate(); }
  };

  const handleCamToggle = e => {
    e.stopPropagation(); setShowFilters(false);
    if(cameraMode){ setCameraMode(false); setTiltMode(false); return; }
    const activateCam = () => {
      navigator.mediaDevices.getUserMedia({
        video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}},audio:false
      }).then(stream=>{
        streamRef.current=stream;
        registerOrientation();
        setArFov(camFov); // start at calibrated FOV
        setTiltMode(true);
        setCameraMode(true);
      }).catch(()=>{});
    };
    if(typeof window.DeviceOrientationEvent?.requestPermission==='function'){
      window.DeviceOrientationEvent.requestPermission().then(p=>{ if(p==='granted') activateCam(); }).catch(()=>{});
    } else { activateCam(); }
  };

  const capturePhoto = e => {
    e.stopPropagation();
    const video=videoRef.current;
    if(!video) return;

    // ── Replicate objectFit:'cover' ──────────────────────────────
    // The <video> fills the screen by cropping; the canvas must capture
    // exactly the same visible crop — not the raw (wider) sensor frame.
    const vW=video.videoWidth||1280, vH=video.videoHeight||720;
    const sW=window.innerWidth,      sH=window.innerHeight;
    const scale=Math.max(sW/vW, sH/vH);          // fill scale
    const srcX=((vW*scale-sW)/2)/scale;           // crop offset in video px
    const srcY=((vH*scale-sH)/2)/scale;
    const srcW=sW/scale;                           // visible region in video px
    const srcH=sH/scale;

    // Cap at 2× device pixel ratio so file size stays sane on Retina screens
    const dpr=Math.min(window.devicePixelRatio||1, 2);
    const W=Math.round(sW*dpr), H=Math.round(sH*dpr);

    const canvas=document.createElement('canvas');
    canvas.width=W; canvas.height=H;
    const ctx=canvas.getContext('2d');

    // Draw only the visible slice (same crop the user sees)
    ctx.drawImage(video, srcX,srcY,srcW,srcH, 0,0,W,H);

    // Aircraft markers — f.x/f.y are screen-space %, scale up by dpr
    mapped.forEach(f=>{
      const px=f.x/100*W, py=f.y/100*H;
      const col=altColor(f.alt);
      ctx.beginPath(); ctx.arc(px,py,14*dpr,0,Math.PI*2);
      ctx.strokeStyle=col; ctx.lineWidth=1.5*dpr; ctx.stroke();
      ctx.beginPath(); ctx.arc(px,py,3*dpr,0,Math.PI*2);
      ctx.fillStyle=col; ctx.fill();
      ctx.font=`bold ${13*dpr}px monospace`; ctx.fillStyle=col;
      ctx.fillText(f.cs, px+18*dpr, py-2*dpr);
      ctx.font=`${11*dpr}px monospace`; ctx.fillStyle='rgba(180,220,255,0.75)';
      ctx.fillText(`${distNmi(f.dist)}nm  ${Math.round(f.alt*3.28084/100)*100}ft`, px+18*dpr, py+14*dpr);
    });

    // HUD stamp
    ctx.font=`${12*dpr}px monospace`; ctx.fillStyle='rgba(77,184,255,0.7)';
    ctx.fillText(`SORATOMO  ${Math.round(heading).toString().padStart(3,'0')}°  ${new Date().toLocaleTimeString()}`,14*dpr,22*dpr);

    // Flash
    setCaptureFlash(true); setTimeout(()=>setCaptureFlash(false),120);

    // Download full-res
    const ts=Date.now();
    const a=document.createElement('a');
    a.download=`soratomo-${ts}.jpg`;
    a.href=canvas.toDataURL('image/jpeg',0.93);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);

    // Thumbnail — match screen aspect ratio (not hardcoded 16:9)
    try{
      const tW=480, tH=Math.round(480*H/W); // preserve captured aspect
      const TC=document.createElement('canvas'); TC.width=tW; TC.height=tH;
      const tx=TC.getContext('2d'); tx.drawImage(canvas,0,0,tW,tH);
      mapped.forEach(f=>{
        const px=f.x/100*tW, py=f.y/100*tH;
        const col=altColor(f.alt);
        tx.beginPath(); tx.arc(px,py,5,0,Math.PI*2);
        tx.strokeStyle=col; tx.lineWidth=1; tx.stroke();
        tx.font='bold 8px monospace'; tx.fillStyle=col;
        tx.fillText(f.cs, px+7, py+3);
      });
      const thumb=TC.toDataURL('image/jpeg',0.65);
      const entry={id:ts,timestamp:ts,thumb,heading:Math.round(heading),count:mapped.length};
      setGallery(prev=>{const next=[entry,...prev].slice(0,20);saveGallery(next);return next;});
    }catch(err){}
  };

  useEffect(()=>{
    // adsb.lol — free, no auth, no rate limits, same ADS-B data
    // API: /v2/lat/{lat}/lon/{lon}/dist/{dist_nm}  →  { ac: [...] }
    // Units returned: alt_baro in FEET, gs in KNOTS — converted to meters/m/s on ingest
    let timer = null;
    const INTERVAL = 1000;  // 1s
    const schedule = (delay) => { timer = setTimeout(poll, delay); };

    const poll = async () => {
      timer = null;
      try {
        const r = await fetch(
          `/adsb/v2/lat/${pos.lat}/lon/${pos.lon}/dist/200`
        );
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (d?.ac?.length > 0) {
          const parsed = d.ac
            .filter(a =>
              a.lat != null && a.lon != null &&      // must have position
              typeof a.alt_baro === 'number' &&      // must have numeric altitude (not "ground")
              a.alt_baro > 0 &&                      // airborne only
              (a.gs ?? 0) > 0                        // must be moving
            )
            .map(a => ({
              id:      a.hex,
              cs:      (a.flight || a.hex || '???').trim(),
              airline: (a.flight || '???').trim().slice(0, 3),
              lat:     a.lat,
              lon:     a.lon,
              alt:     Math.max(a.alt_baro * 0.3048, 91), // ft → m (alt_baro is numeric here)
              spd:     (a.gs ?? 0) * 0.5144,              // knots → m/s
              hdg:     a.track ?? 0,
              posAge:  a.seen_pos ?? a.seen ?? 0, // seconds since ADS-B position was broadcast
              type:    a.t ?? '',              // ICAO type designator (B738, A320, etc.)
              reg:     a.r ?? '',              // tail number / registration
              emitter: a.category ?? '',       // ADS-B emitter category (A7=rotorcraft)
            }));
          // Merge new positions into state, carrying history forward (survives re-renders)
          lastFetchMs.current = Date.now(); // record when live data arrived
          setFlights(prev=>{
            const prevMap=new Map(prev.map(p=>[p.id,p]));
            return parsed.map(f=>{
              const old=prevMap.get(f.id);
              // Keep last 4 prev positions → slice(-4) + current = 5 total → 4 trail segments
              const history=[...(old?.history||[]).slice(-10),{lat:f.lat,lon:f.lon,alt:f.alt}]; // 11 pts = ~55s trail (−12%)
              // Apply any already-cached type enrichment
              const c=typeCacheRef.current.get(f.id);
              const typeFields=(c&&typeof c==='object'&&!f.type)?{type:c.type,reg:c.reg||f.reg}:{};
              return {...f,...typeFields,history};
            });
          });
          setApiStatus('live');
          demoAlerted.current=false; // reset so next outage shows banner again
          schedule(INTERVAL);

          // Queue type lookups for aircraft still missing type info (max 5/cycle)
          // Uses adsbdb.com — returns 200 for all hex codes (empty response for unknowns)
          const toLookup=parsed
            .filter(f=>!f.type&&typeCacheRef.current.get(f.id)===undefined)
            .slice(0,5);
          if(toLookup.length){
            toLookup.forEach(f=>typeCacheRef.current.set(f.id,'pending'));
            Promise.all(toLookup.map(async f=>{
              try{
                const r=await fetch(`/adsbdb/v0/aircraft/${f.id.toLowerCase()}`);
                if(!r.ok) throw new Error();
                const d=await r.json();
                const ac=d?.response?.aircraft;
                if(!ac){ typeCacheRef.current.set(f.id,null); return null; }
                const result={id:f.id,type:ac.icao_type||'',reg:ac.registration||'',owner:ac.registered_owner||''};
                typeCacheRef.current.set(f.id,result);
                return result;
              }catch{ typeCacheRef.current.set(f.id,null); return null; }
            })).then(results=>{
              const hits=results.filter(Boolean);
              if(!hits.length) return;
              // Enrich flights — history is preserved via spread
              setFlights(prev=>prev.map(f=>{
                const h=hits.find(r=>r.id===f.id);
                return (h&&!f.type)?{...f,type:h.type,reg:h.reg||f.reg}:f;
              }));
              setLogbook(prev=>{
                let changed=false;
                const next=prev.map(entry=>{
                  // Match by type code or by callsign prefix heuristic
                  const hit=hits.find(h=>
                    (h.type&&h.type===entry.type) ||
                    entry.tails.some(t=>t.cs&&t.cs.startsWith(h.id.slice(0,3))));
                  if(!hit) return entry;
                  changed=true;
                  return {...entry,
                    type:hit.type||entry.type,
                    owner:hit.owner||entry.owner||'', // registered owner from adsbdb
                  };
                });
                if(changed) saveLog(next);
                return changed?next:prev;
              });
              saveTypeCache(typeCacheRef.current); // persist to localStorage for next session
            }).catch(()=>{}); // swallow any unhandled rejection from type lookup
          }
          return;
        }
      } catch(e) {}

      // Fetch failed — show demo, alert user once per outage
      setFlights([]);         // no demo aircraft — show real data or nothing
      setApiStatus('demo');
      if(!demoAlerted.current){
        demoAlerted.current=true;
        setRangeNote('⚠ NO LIVE DATA — showing demo aircraft');
      }
      schedule(INTERVAL);
    };

    poll();
    return () => { if(timer) clearTimeout(timer); };
  },[pos]);

  // Proximity / logbook tracking — grouped by aircraft type
  useEffect(()=>{
    const COOLDOWN=4*60*60*1000;
    const threshM=Math.min(proximityNmi,25)*1852; // hard cap: never log beyond 25 nmi
    const currentlyNear=new Set();

    flights.forEach(f=>{
      if(msToKts(f.spd)<100) return;
      if(f.alt*3.28084<500) return;
      const dist=haversine(pos.lat,pos.lon,f.lat,f.lon);
      if(dist>threshM) return;

      const tailKey=f.reg||f.cs;        // unique per aircraft
      const typeKey=f.type||'UNKN';     // grouping key
      currentlyNear.add(tailKey);

      const lastTime=lastLoggedTime.current.get(tailKey)||0;
      if(Date.now()-lastTime<COOLDOWN){
        // Cooldown active — only update closest approach
        const enc=activeEncounters.current.get(tailKey);
        if(enc&&dist<enc.minDist){
          activeEncounters.current.set(tailKey,{...enc,minDist:dist});
          const newNmi=parseFloat(distNmi(dist));
          setLogbook(prev=>{
            const next=prev.map(e=>{
              if(e.type!==typeKey) return e;
              const newTails=e.tails.map(t=>
                t.key===tailKey?{...t,closestNmi:Math.min(t.closestNmi,newNmi)}:t);
              return {...e,tails:newTails,closestNmi:Math.min(...newTails.map(t=>t.closestNmi))};
            });
            // Debounce: closest-approach updates fire every 5s — write at most every 30s
            clearTimeout(saveLogTimer.current);
            saveLogTimer.current=setTimeout(()=>saveLog(next),30000);
            return next;
          });
        }
        return;
      }

      if(!activeEncounters.current.has(tailKey)){
        // Fresh encounter
        const isNew=!historicTails.current.has(tailKey);
        const tailEntry={
          key:tailKey, reg:f.reg||'', cs:f.cs,
          airline:f.airline||f.cs.slice(0,3),
          city:nearestCity(f.lat,f.lon),
          closestNmi:parseFloat(distNmi(dist)),
          alt:Math.round(f.alt*3.28084/100)*100,
          hdg:Math.round(f.hdg),
          spd:Math.round(msToKts(f.spd)),
          lat:parseFloat(f.lat.toFixed(4)),
          lon:parseFloat(f.lon.toFixed(4)),
          isNew, timestamp:Date.now(),
        };
        activeEncounters.current.set(tailKey,{minDist:dist,typeKey});
        lastLoggedTime.current.set(tailKey,Date.now());
        historicTails.current.add(tailKey);

        setLogbook(prev=>{
          const idx=prev.findIndex(e=>e.type===typeKey);
          let next;
          if(idx>=0){
            const entry=prev[idx];
            if(entry.tails.some(t=>t.key===tailKey)) return prev; // duplicate guard
            const newTails=[...entry.tails,tailEntry];
            const updated={...entry,tails:newTails,
              closestNmi:Math.min(entry.closestNmi,tailEntry.closestNmi),
              lastSeen:Date.now()};
            next=[...prev.slice(0,idx),updated,...prev.slice(idx+1)];
          } else {
            next=[{
              id:typeKey+'-'+Date.now(),
              type:typeKey,
              cat:getAircraftCat(typeKey!=='UNKN'?typeKey:'', f.emitter||''),
              tails:[tailEntry],
              closestNmi:tailEntry.closestNmi,
              lastSeen:Date.now(),
            },...prev].slice(0,200);
          }
          saveLog(next); return next;
        });

        const nid=Date.now()+Math.random();
        const toast={nid,cs:f.cs,airline:f.airline||f.cs.slice(0,3),closestNmi:distNmi(dist),isNew};
        setToasts(prev=>[...prev.slice(-2),toast]);
        setTimeout(()=>setToasts(prev=>prev.filter(t=>t.nid!==nid)),4500);
      } else {
        const enc=activeEncounters.current.get(tailKey);
        if(dist<enc.minDist){
          activeEncounters.current.set(tailKey,{...enc,minDist:dist});
          const newNmi=parseFloat(distNmi(dist));
          setLogbook(prev=>{
            const next=prev.map(e=>{
              if(e.type!==enc.typeKey) return e;
              const newTails=e.tails.map(t=>
                t.key===tailKey?{...t,closestNmi:Math.min(t.closestNmi,newNmi)}:t);
              return {...e,tails:newTails,closestNmi:Math.min(...newTails.map(t=>t.closestNmi))};
            });
            clearTimeout(saveLogTimer.current);
            saveLogTimer.current=setTimeout(()=>saveLog(next),30000);
            return next;
          });
        }
      }
    });

    for(const [tk] of activeEncounters.current){
      if(!currentlyNear.has(tk)) activeEncounters.current.delete(tk);
    }
  },[flights,pos,proximityNmi]);

  const handleProxChange = nmi => {
    setProximityNmi(nmi);
    try{ localStorage.setItem(PROX_KEY,String(nmi)); }catch{}
    activeEncounters.current.clear();
    // NOTE: do NOT clear lastLoggedTime here — the 4hr cooldown must survive proximity changes
  };

  const handleResetAllFilters = () => {
    setAltFloor(0); setAltCeiling(ALT_MAX);
    setTypeFilter('all');
    setMinSpeedKts(0); setMaxSpeedKts(700);
    setMaxDisplayNmi(500);
  };

  useEffect(()=>{const t=setTimeout(()=>setShowHint(false),5000);return()=>clearTimeout(t);},[]);

  // Touch/mouse: drag to scan (non-tilt) + pinch to zoom (any mode)
  const onDown=useCallback(e=>{
    if(e.touches?.length===2){
      // Pinch start — works in both modes
      const dx=e.touches[1].clientX-e.touches[0].clientX;
      const dy=e.touches[1].clientY-e.touches[0].clientY;
      pinchRef.current={dist:Math.hypot(dx,dy), fov:arFov};
      return;
    }
    if(tiltMode) return; // single-finger ignored in AR mode (device sensor drives view)
    const x=e.touches?e.touches[0].clientX:e.clientX;
    const y=e.touches?e.touches[0].clientY:e.clientY;
    // Store sensitivity at drag-start (degrees per pixel), used in mv closure
    const sens=arFov/window.innerWidth;
    dragRef.current={x, y, h:scanHeading, p:scanPitch, sens};
  },[scanHeading,scanPitch,tiltMode,arFov]);

  useEffect(()=>{
    const mv=e=>{
      // Pinch zoom — two fingers
      if(e.touches?.length===2 && pinchRef.current){
        const dx=e.touches[1].clientX-e.touches[0].clientX;
        const dy=e.touches[1].clientY-e.touches[0].clientY;
        const dist=Math.hypot(dx,dy);
        // Spread fingers → smaller FOV (zoom in); pinch → larger FOV (zoom out)
        const newFov=Math.max(20,Math.min(120, pinchRef.current.fov*(pinchRef.current.dist/dist)));
        setArFov(newFov);
        return;
      }
      // Single-finger drag — pan scanHeading (H) and scanPitch (V)
      if(!dragRef.current) return;
      const x=e.touches?e.touches[0]?.clientX:e.clientX;
      const y=e.touches?e.touches[0]?.clientY:e.clientY;
      if(x==null||y==null) return;
      const {sens}=dragRef.current;
      setScanHeading((((dragRef.current.h-(x-dragRef.current.x)*sens)%360)+360)%360);
      setScanPitch(Math.max(-60,Math.min(60, dragRef.current.p+(y-dragRef.current.y)*sens)));
    };
    const up=()=>{dragRef.current=null; pinchRef.current=null;};
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
    window.addEventListener('touchmove',mv,{passive:true}); window.addEventListener('touchend',up);
    return ()=>{
      window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up);
      window.removeEventListener('touchmove',mv); window.removeEventListener('touchend',up);
    };
  },[]);

  const activeFov  = arFov;                     // both modes use arFov; default = HFOV
  const activeVFov = arFov*(VFOV/HFOV);
  const zoomLevel  = (HFOV/activeFov).toFixed(1); // 1.0x at default, higher when zoomed

  // Unified view direction — AR uses device sensors, scan uses free-pan state
  // Apply heading & pitch trim biases in tilt/camera mode for AR alignment
  const viewHdg   = tiltMode ? (heading + hdgBias + 360) % 360 : scanHeading;
  const viewPitch = tiltMode ? (devicePitch + pitchBias) : scanPitch;

  // Military-category check — includes mil helos (UH/AH/MH/HH/CH/OH/SH/TH)
  // which correctly categorise as 'helicopter' not 'military'
  const isMilCat=(cat,type='')=>{
    if(cat==='military'||cat==='milTransport') return true;
    if(cat==='helicopter'){
      const t=(type||'').toUpperCase();
      return /^UH|^AH|^MH|^HH|^CH[3-5]|^OH|^SH[36]|^TH/.test(t);
    }
    return false;
  };

  const visibleFlights=flights.filter(f=>{
    const ft=f.alt*3.28084;
    if(ft<altFloor||ft>altCeiling) return false;
    const kts=msToKts(f.spd);
    if(kts<minSpeedKts||kts>maxSpeedKts) return false;
    const distM=haversine(pos.lat,pos.lon,f.lat,f.lon);
    if(distM>maxDisplayNmi*1852) return false;
    const cat=getAircraftCat(f.type);
    if(typeFilter==='commercial'&&isMilCat(cat,f.type)) return false;
    if(typeFilter==='military'&&!isMilCat(cat,f.type)) return false;
    return true;
  });
  const mapped=visibleFlights.map(f=>{
    // Dead reckoning: project ADS-B position forward to now using reported hdg+spd
    // posAge = seconds since transponder broadcast; add elapsed since our fetch
    const totalAgeSec = (f.posAge||0) + (Date.now()-lastFetchMs.current)/1000;
    const extraM = f.spd * Math.min(totalAgeSec, 45); // cap at 45s; spd in m/s
    const hdgRad = f.hdg * (Math.PI/180);
    const R = 6371000;
    const rLat = f.lat + (Math.cos(hdgRad)*extraM/R)*(180/Math.PI);
    const rLon = f.lon + (Math.sin(hdgRad)*extraM/(R*Math.cos(f.lat*Math.PI/180)))*(180/Math.PI);
    const dist=haversine(pos.lat,pos.lon,rLat,rLon);
    const bear=getBearing(pos.lat,pos.lon,rLat,rLon);
    const elev=getElev(dist,f.alt);
    const sc=toScreenTilt(bear,elev,viewHdg,viewPitch,activeFov,activeVFov);
    // Project historical positions — no FOV clipping so trail persists near edges
    // SVG overflow:hidden clips lines at viewport boundary naturally
    const trail=(f.history||[]).slice(0,-1).map(h=>{
      const hd=haversine(pos.lat,pos.lon,h.lat,h.lon);
      const hb=getBearing(pos.lat,pos.lon,h.lat,h.lon);
      const he=getElev(hd,h.alt);
      const hDiff=((hb-viewHdg+540)%360)-180;
      const vDiff=he-viewPitch;
      return {x:50+(hDiff/(activeFov/2))*50, y:50-(vDiff/(activeVFov/2))*50};
    });
    // ── Uncertainty bubble radius (vw units) ──
    // Sources: ADS-B position age, user DR age, compass error (~2°)
    const compassUncertM  = dist * Math.sin(2 * D2R);  // 2° compass error
    const drAgeSec2       = drAnchor.current ? Math.min((Date.now()-drAnchor.current.ts)/1000, 30) : 0;
    const userUncertM     = drVel.current.speedMs * drAgeSec2;
    const totalUncertM    = Math.sqrt(extraM**2 + userUncertM**2 + compassUncertM**2);
    const angUncertDeg    = 2 * Math.atan2(totalUncertM, Math.max(dist, 500)) * (180/Math.PI);
    const uncertRadiusVw  = Math.max(3, Math.min(24, (angUncertDeg/activeFov)*50));
    return {...f,dist,bear,elev,...sc,trail,uncertRadiusVw};
  }).filter(f=>f.on && (!cameraMode || f.dist<=55560)); // 55560m = 30 nmi in cam mode


  // Auto-reduce display range when >80 aircraft are in mapped
  useEffect(()=>{
    if(mapped.length<=80) return;
    // Sort all flights by distance, find the 80th closest
    const sorted=[...flights]
      .filter(f=>{
        const ft=f.alt*3.28084;
        return ft>=altFloor&&ft<=altCeiling&&msToKts(f.spd)>=minSpeedKts&&msToKts(f.spd)<=maxSpeedKts;
      })
      .map(f=>({...f,_d:haversine(pos.lat,pos.lon,f.lat,f.lon)}))
      .sort((a,b)=>a._d-b._d);
    if(sorted.length<=80) return;
    const newNmi=Math.max(10,Math.ceil(sorted[79]._d/1852));
    if(newNmi>=maxDisplayNmi) return; // already tighter or equal
    setMaxDisplayNmi(newNmi);
    setRangeNote(`Range auto-reduced to ${newNmi} nmi · adjust in FILTER`);
  },[mapped.length]);

  // Separate effect: dismiss rangeNote after 3 s (avoids cleanup race)
  useEffect(()=>{
    if(!rangeNote) return;
    // Demo alerts stay longer so the user definitely sees them
    const ms = rangeNote.includes('demo') ? 8000 : 3000;
    const t=setTimeout(()=>setRangeNote(null),ms);
    return ()=>clearTimeout(t);
  },[rangeNote]);

  // Track first-appearance aircraft for ping animation
  const displayNewIds=useMemo(()=>new Set(
    mapped.filter(f=>!prevMappedRef.current.has(f.id)).map(f=>f.id)
  ),[mapped]);
  useEffect(()=>{
    prevMappedRef.current=new Set(mapped.map(f=>f.id));
  },[mapped]);

  const maxRange=visibleFlights.length
    ?Math.round(Math.max(...visibleFlights.map(f=>haversine(pos.lat,pos.lon,f.lat,f.lon)))/1852):0;
  const isFilterActive=altFloor>0||altCeiling<ALT_MAX||typeFilter!=='all'||minSpeedKts>0||maxSpeedKts<700||maxDisplayNmi<400;
  // With beta-90 fix: positive pitch = looking up → horizon is below center (larger y%)
  const horizonY=tiltMode?Math.max(5,Math.min(92,50+(devicePitch/(activeVFov/2))*50)):58;
  // Memoize — only recomputes when user position changes (once per session)
  const cityData=useMemo(()=>CITIES.map(c=>({
    ...c,
    dist:haversine(pos.lat,pos.lon,c.lat,c.lon),
    bear:getBearing(pos.lat,pos.lon,c.lat,c.lon),
  })),[pos]);
  const apData=useMemo(()=>AIRPORTS.map(a=>({
    ...a,
    dist:haversine(pos.lat,pos.lon,a.lat,a.lon),
    bear:getBearing(pos.lat,pos.lon,a.lat,a.lon),
  })),[pos]);

  // Auto-center on selected aircraft only when few aircraft in view (>3 is busy/airport area)
  const handleSelectFlight=flight=>{
    setSelectedId(flight.id);
    if(mapped.length<=3) setHeading(flight.bear);
    setSearch('');
    setShowFilters(false);
  };
  // Derive live selected flight from mapped every render — auto-updates on each ADS-B fetch
  const selected = selectedId ? mapped.find(f=>f.id===selectedId)||null : null;
  const proximityM=proximityNmi*1852;

  return (
    <div onMouseDown={onDown} onTouchStart={onDown}
      onClick={()=>{setSelectedId(null);setShowFilters(false);}}
      style={{position:'fixed',top:0,left:0,right:0,bottom:0,
        background:cameraMode?'transparent':'linear-gradient(175deg,#010a18 0%,#020e24 55%,#031330 100%)',
        overflow:'hidden',cursor:(tiltMode||cameraMode)?'default':'grab',
        userSelect:'none',fontFamily:"'Exo 2',sans-serif",touchAction:'none',
        zoom:density==='normal'?1.15:1}}>
      <style>{STYLES}</style>

      {/* Camera feed — behind everything */}
      {cameraMode&&<video ref={videoRef} autoPlay playsInline muted
        style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',zIndex:0}}/>}
      {/* Capture flash overlay */}
      {captureFlash&&<div style={{position:'absolute',inset:0,background:'#fff',opacity:0.6,zIndex:99,pointerEvents:'none'}}/>}

      {!cameraMode&&<div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:1,
        background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,12,35,.14) 3px)'}}/> }
      {!cameraMode&&<div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:1,
        backgroundImage:'linear-gradient(rgba(77,184,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(77,184,255,.022) 1px,transparent 1px)',
        backgroundSize:'50px 50px'}}/> }
      {!cameraMode&&<div style={{position:'absolute',width:1600,height:1600,top:'50%',left:'50%',
        background:'conic-gradient(from 0deg,rgba(77,184,255,0) 330deg,rgba(77,184,255,.04) 360deg)',
        borderRadius:'50%',animation:'sweep 1s linear infinite',pointerEvents:'none',zIndex:1}}/> }
      {!cameraMode&&<div style={{position:'absolute',bottom:0,left:0,right:0,height:'50%',pointerEvents:'none',zIndex:1,
        background:'radial-gradient(ellipse 90% 40% at 50% 100%,rgba(18,70,160,.07) 0%,transparent 70%)'}}/> }
      <div style={{position:'absolute',left:'3%',top:'4%',bottom:'14%',width:1,background:'rgba(77,184,255,.18)',zIndex:2,pointerEvents:'none'}}/>
      <div style={{position:'absolute',right:'3%',top:'4%',bottom:'14%',width:1,background:'rgba(77,184,255,.18)',zIndex:2,pointerEvents:'none'}}/>

      {/* Above/below horizon tint — subtle sky vs ground calibration cue */}
      {!cameraMode&&<>
        <div style={{position:'absolute',top:0,left:0,right:0,height:`${horizonY}%`,
          background:'rgba(10,30,70,0.18)',pointerEvents:'none',zIndex:2,
          transition:'height 0.12s linear'}}/>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:`${100-horizonY}%`,
          background:'rgba(5,12,5,0.22)',pointerEvents:'none',zIndex:2,
          transition:'height 0.12s linear'}}/>
      </>}

      {/* Horizon */}
      <div style={{position:'absolute',top:`${horizonY}%`,left:'4%',right:'4%',height:1,
        background:'rgba(77,184,255,.25)',zIndex:2,pointerEvents:'none'}}>
        <span style={{position:'absolute',right:4,top:-9,fontSize:9,color:'rgba(77,184,255,.55)',fontFamily:"'Orbitron',monospace",letterSpacing:'.1em'}}>HRZ</span>
        <span style={{position:'absolute',left:4,top:-9,fontSize:9,color:'rgba(77,184,255,.55)',fontFamily:"'Orbitron',monospace",letterSpacing:'.1em'}}>HRZ</span>
      </div>

      {/* Crosshair */}
      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:2,pointerEvents:'none',opacity:tiltMode?1:0.7}}>
        <svg width="44" height="44" viewBox="0 0 44 44">
          {[
            [18,2,18,16],[18,28,18,42],
            [2,22,16,22],[28,22,42,22],
          ].map(([x1,y1,x2,y2],i)=>(
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(77,184,255,.55)" strokeWidth="1.5"/>
          ))}
          <circle cx="22" cy="22" r="4" stroke="rgba(77,184,255,.55)" strokeWidth="1.5" fill="none"/>
          {tiltMode&&<circle cx="22" cy="22" r="9" stroke="rgba(77,184,255,.2)" strokeWidth="1" fill="none"/>}
        </svg>
      </div>

      {(()=>{
        // Cities + airports pinned at horizon — only x moves as you pan
        const pinY    = horizonY + 2.5;
        const halfFov = activeFov / 2;
        const project = (item, type, maxDist) => {
          if(item.dist > maxDist) return null;
          const diff    = ((item.bear - viewHdg + 540) % 360) - 180;
          if(Math.abs(diff) >= halfFov * 0.95) return null;
          const x       = 50 + (diff / halfFov) * 50;
          const fade    = Math.max(0, 1 - Math.abs(diff) / halfFov);
          const dFade   = Math.min(1, item.dist / 80000);
          const opacity = fade * 0.82 * Math.min(1, dFade + 0.3);
          return {...item, x, opacity, type};
        };
        // Airports visible up to 250 nmi; cities up to 100 nmi
        const pts = [
          ...apData.map(a  => project(a, 'ap',   463000)).filter(Boolean),
          ...cityData.map(c => project(c, 'city', 185200)).filter(Boolean),
        ].sort((a,b) => a.dist - b.dist);
        // De-overlap across both types combined
        const MIN_GAP_X = 9;
        const accepted = [];
        for(const p of pts){
          if(!accepted.some(a => Math.abs(p.x - a.x) < MIN_GAP_X))
            accepted.push(p);
        }
        return accepted.map(p => p.type === 'ap' ? (
          // ── Airport label ──────────────────────────────────────
          <div key={`ap-${p.id}`} style={{
            position:'absolute', left:`${p.x}%`, top:`${pinY}%`,
            transform:'translate(-50%,0)', textAlign:'center',
            pointerEvents:'none', zIndex:3, opacity:p.opacity,
            transition:'left 0.1s linear'}}>
            <div style={{fontSize:9,color:'rgba(252,211,77,0.75)',
              lineHeight:1,marginBottom:2}}>✈</div>
            <div style={{fontSize:9,color:'#fcd34d',
              fontFamily:"'Orbitron',monospace",whiteSpace:'nowrap',
              fontWeight:700,letterSpacing:'.06em',
              textShadow:'0 0 6px rgba(252,180,0,0.45)'}}>{p.id}</div>
            <div style={{fontSize:8,color:'rgba(252,211,77,0.55)',
              fontFamily:"'Orbitron',monospace"}}>{distNmi(p.dist)} nmi</div>
          </div>
        ) : (
          // ── City label ─────────────────────────────────────────
          <div key={`city-${p.name}-${p.st}`} style={{
            position:'absolute', left:`${p.x}%`, top:`${pinY}%`,
            transform:'translate(-50%,0)', textAlign:'center',
            pointerEvents:'none', zIndex:3, opacity:p.opacity,
            transition:'left 0.1s linear'}}>
            <div style={{width:3,height:3,background:'rgba(160,210,240,0.65)',
              borderRadius:'50%',margin:'0 auto 3px'}}/>
            <div style={{fontSize:9,color:'#c8eaf8',
              fontFamily:"'Orbitron',monospace",whiteSpace:'nowrap',
              letterSpacing:'.05em',textShadow:'0 0 6px rgba(77,184,255,0.4)'}}>{p.name}</div>
            <div style={{fontSize:8,color:'rgba(160,210,240,0.6)',
              fontFamily:"'Orbitron',monospace"}}>{distNmi(p.dist)} nmi</div>
          </div>
        ));
      })()}

      {/* Tilt overlays */}
      {tiltMode&&(
        <div style={{position:'absolute',right:12,top:'15%',bottom:'25%',zIndex:5,
          display:'flex',flexDirection:'column',justifyContent:'space-between',
          alignItems:'flex-end',pointerEvents:'none'}}>
          {[90,60,45,30,15,0,-10].map(deg=>(
            <div key={deg} style={{display:'flex',alignItems:'center',gap:4}}>
              <div style={{fontSize:9,fontFamily:"'Orbitron',monospace",transition:'color 0.2s',
                color:Math.abs(deg-Math.round(devicePitch))<8?'#4db8ff':'#3a6878'}}>{deg}&deg;</div>
              <div style={{width:deg===0?8:4,height:1,background:deg===0?'rgba(77,184,255,.5)':'rgba(77,184,255,.2)'}}/>
            </div>
          ))}
        </div>
      )}
      {tiltMode&&(
        <div style={{position:'absolute',left:12,top:'43%',zIndex:5,pointerEvents:'none'}}>
          <div style={{fontSize:9,color:'#4a7898',fontFamily:"'Orbitron',monospace",letterSpacing:'.1em',marginBottom:2}}>AIM</div>
          <div style={{fontSize:19,color:'#4db8ff',fontFamily:"'Orbitron',monospace",fontWeight:700,lineHeight:1}}>
            {Math.round(devicePitch)}&deg;
          </div>
          <div style={{fontSize:10,color:'#3a6878',fontFamily:"'Orbitron',monospace",marginTop:6,letterSpacing:'.06em'}}>{zoomLevel}x ZOOM</div>
          <div style={{fontSize:9,color:'#254558',fontFamily:"'Orbitron',monospace",marginTop:1}}>FOV {Math.round(activeFov)}&deg;</div>
          {parseFloat(zoomLevel)>1.05&&(
            <div onClick={()=>setArFov(HFOV)} style={{
              fontSize:9,color:'#3a7888',fontFamily:"'Orbitron',monospace",
              marginTop:6,cursor:'pointer',textDecoration:'underline',
              pointerEvents:'auto',
            }}>RESET ZOOM</div>
          )}
        </div>
      )}

      {/* ── TOP HUD ── */}
      <div style={{position:'absolute',top:0,left:0,right:0,zIndex:10,
        background:'linear-gradient(180deg,rgba(1,7,18,.93) 0%,transparent 100%)',
        padding:'12px 16px 28px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:12,fontFamily:"'Orbitron',monospace",fontWeight:700,
              color:'#b8e4ff',letterSpacing:'.22em',lineHeight:1}}>SORATOMO</div>
            {/* Tagline — stays in DOM, fades to 0 after 4s */}
            <div style={{
              fontSize:11,color:'#7aacc8',fontFamily:"'Exo 2',sans-serif",
              fontStyle:'italic',marginTop:3,letterSpacing:'.03em',
              transition:'opacity 1.5s ease',
              opacity:taglineOpacity,
              pointerEvents:'none',
            }}>Skygazing, for aircraft.</div>
            {/* Location icon — tap to toggle coords */}
            <div onClick={e=>{e.stopPropagation();setShowCoords(v=>!v);}} style={{
              marginTop:5,display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
              <svg width='11' height='13' viewBox='0 0 11 13'>
                <circle cx='5.5' cy='5' r='3.2' fill='none'
                  stroke={showCoords?'#4db8ff':'#2a4a58'} strokeWidth='1.3'/>
                <circle cx='5.5' cy='5' r='1.2'
                  fill={showCoords?'#4db8ff':'#2a4a58'}/>
                <path d='M5.5 8.5 L5.5 12' stroke={showCoords?'#4db8ff':'#2a4a58'}
                  strokeWidth='1.3' strokeLinecap='round'/>
              </svg>
              {showCoords&&(
                <span style={{fontSize:10,color:'#4db8ff',
                  fontFamily:"'Orbitron',monospace",letterSpacing:'.08em'}}>
                  {pos.lat.toFixed(4)}N {Math.abs(pos.lon).toFixed(4)}{pos.lon<0?'W':'E'}
                </span>
              )}
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5}}>
            <div style={{display:'flex',alignItems:'center',gap:3,flexWrap:'wrap',justifyContent:'flex-end'}}>
              <div style={{display:'flex',alignItems:'center',gap:4}}>
                <div style={{width:6,height:6,borderRadius:'50%',
                  background:apiStatus==='live'?'#2dffb4':apiStatus==='limited'?'#f59e0b':'#ff4444',
                  animation:`pulse ${apiStatus==='demo'?'0.8s':'1.6s'} ease-in-out infinite`}}/>
                <span style={{
                  fontSize:10,fontFamily:"'Orbitron',monospace",letterSpacing:'.12em',
                  fontWeight:apiStatus==='demo'?700:400,
                  color:apiStatus==='live'?'#2dffb4':apiStatus==='limited'?'#f59e0b':'#ff4444',
                }}>
                  {apiStatus==='live'?'LIVE':apiStatus==='limited'?'RATE LIMITED':'⚠ DEMO'}
                </span>
              </div>
              {/* Density toggle */}
              <button onClick={e=>{e.stopPropagation();setDensity(d=>d==='compact'?'normal':'compact');}} style={{
                background:density==='normal'?'rgba(77,184,255,0.1)':'transparent',
                border:`1px solid ${density==='normal'?'rgba(77,184,255,0.4)':'rgba(77,184,255,0.2)'}`,
                borderRadius:5,padding:'4px 5px',cursor:'pointer',
                display:'flex',alignItems:'center',gap:4}}>
                <span style={{fontSize:density==='normal'?11:9,fontFamily:"'Orbitron',monospace",
                  color:density==='normal'?'#4db8ff':'#4a7898',fontWeight:700,letterSpacing:0}}>Aa</span>
              </button>
              {tiltMode&&!cameraMode&&(
                <button onClick={e=>{e.stopPropagation();setShowCalib(v=>!v);}} style={{
                  background:showCalib?'rgba(77,184,255,0.15)':'transparent',
                  border:`1px solid ${showCalib?'#4db8ff':'rgba(77,184,255,0.3)'}`,
                  borderRadius:5,padding:'4px 7px',cursor:'pointer',
                  display:'flex',alignItems:'center',gap:3}}>
                  <svg width='10' height='10' viewBox='0 0 10 10'>
                    <line x1='5' y1='0' x2='5' y2='10' stroke={showCalib?'#4db8ff':'#4a7898'} strokeWidth='1'/>
                    <line x1='0' y1='5' x2='10' y2='5' stroke={showCalib?'#4db8ff':'#4a7898'} strokeWidth='1'/>
                    <circle cx='5' cy='5' r='2.5' stroke={showCalib?'#4db8ff':'#4a7898'} strokeWidth='1' fill='none'/>
                  </svg>
                  <span style={{fontSize:8,fontFamily:"'Orbitron',monospace",color:showCalib?'#4db8ff':'#4a7898',letterSpacing:'.06em'}}>ALIGN</span>
                </button>
              )}
              <button onClick={handleARToggle} style={{background:tiltMode&&!cameraMode?'rgba(77,184,255,0.12)':'transparent',
                border:`1px solid ${tiltMode&&!cameraMode?'#4db8ff':'rgba(77,184,255,0.25)'}`,
                borderRadius:5,padding:'5px 6px',cursor:'pointer',
                display:'flex',alignItems:'center',
                animation:tiltMode&&!cameraMode?'arPulse 2s ease-in-out infinite':'none'}}>
                <svg width="11" height="11" viewBox="0 0 11 11">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke={tiltMode&&!cameraMode?'#4db8ff':'#4a7898'} strokeWidth="1.5" fill="none"/>
                  <circle cx="5.5" cy="5.5" r="1.5" fill={tiltMode&&!cameraMode?'#4db8ff':'#4a7898'}/>
                </svg>
              </button>
              {/* Camera mode button */}
              <button onClick={handleCamToggle} style={{background:cameraMode?'rgba(45,255,180,0.12)':'transparent',
                border:`1px solid ${cameraMode?'#2dffb4':'rgba(77,184,255,0.25)'}`,
                borderRadius:5,padding:'5px 6px',cursor:'pointer',
                display:'flex',alignItems:'center',
                animation:cameraMode?'arPulse 2s ease-in-out infinite':'none'}}>
                <svg width="13" height="11" viewBox="0 0 13 11">
                  <rect x="1" y="2" width="11" height="8" rx="1.5"
                    stroke={cameraMode?'#2dffb4':'#4a7898'} strokeWidth="1.2" fill="none"/>
                  <circle cx="6.5" cy="6" r="2.2"
                    stroke={cameraMode?'#2dffb4':'#4a7898'} strokeWidth="1.2" fill="none"/>
                  <rect x="4.5" y="0.5" width="4" height="2" rx="0.8"
                    fill={cameraMode?'#2dffb4':'#4a7898'}/>
                </svg>
              </button>
              {/* Shutter button — only in camera mode */}
              {cameraMode&&(
                <>
                <button onClick={capturePhoto} style={{background:'rgba(255,255,255,0.1)',
                  border:'1.5px solid rgba(255,255,255,0.7)',borderRadius:5,padding:'5px 6px',
                  cursor:'pointer',display:'flex',alignItems:'center'}}>
                  <svg width="13" height="13" viewBox="0 0 13 13">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" fill="none"/>
                    <circle cx="6.5" cy="6.5" r="3"   fill="rgba(255,255,255,0.9)"/>
                  </svg>
                </button>
                <button onClick={e=>{e.stopPropagation();setShowCalib(v=>!v);}} style={{
                  background:showCalib?'rgba(45,255,180,0.15)':'transparent',
                  border:`1.5px solid ${showCalib?'#2dffb4':'rgba(45,255,180,0.4)'}`,
                  borderRadius:5,padding:'4px 8px',cursor:'pointer',
                  display:'flex',alignItems:'center',gap:4}}>
                  <span style={{fontSize:9,fontFamily:"'Orbitron',monospace",color:'#2dffb4',letterSpacing:'.08em'}}>FOV</span>
                </button>
                <button onClick={e=>{e.stopPropagation();setShowGallery(v=>!v);}} style={{
                  background:showGallery?'rgba(45,255,180,0.15)':'transparent',
                  border:`1.5px solid ${showGallery?'#2dffb4':'rgba(45,255,180,0.35)'}`,
                  borderRadius:5,padding:'5px 6px',cursor:'pointer',
                  display:'flex',alignItems:'center',position:'relative'}}>
                  <svg width='12' height='12' viewBox='0 0 12 12'>
                    <rect x='0.5' y='0.5' width='4.5' height='4.5' rx='0.8' fill={showGallery?'#2dffb4':'#4a9878'}/>
                    <rect x='7'   y='0.5' width='4.5' height='4.5' rx='0.8' fill={showGallery?'#2dffb4':'#4a9878'}/>
                    <rect x='0.5' y='7'   width='4.5' height='4.5' rx='0.8' fill={showGallery?'#2dffb4':'#4a9878'}/>
                    <rect x='7'   y='7'   width='4.5' height='4.5' rx='0.8' fill={showGallery?'#2dffb4':'#4a9878'}/>
                  </svg>
                  {gallery.length>0&&<div style={{position:'absolute',top:-3,right:-3,
                    background:'#2dffb4',borderRadius:'50%',width:10,height:10,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:7,color:'#010a18',fontFamily:"'Orbitron',monospace",fontWeight:700,
                    border:'1px solid #010a18'}}>{Math.min(gallery.length,99)}</div>}
                </button>
                </>
              )}
              <button onClick={e=>{e.stopPropagation();setShowStats(v=>!v);setShowLog(false);setShowFilters(false);}} style={{
                background:showStats?'rgba(77,184,255,0.1)':'transparent',
                border:`1px solid ${showStats?'rgba(77,184,255,0.4)':'rgba(77,184,255,0.2)'}`,
                borderRadius:5,padding:'5px 6px',cursor:'pointer',
                display:'flex',alignItems:'center'}}>
                <svg width="11" height="11" viewBox="0 0 11 11">
                  <rect x="1" y="7" width="2.5" height="3.5" rx="0.5" fill={showStats?'#4db8ff':'#4a7898'}/>
                  <rect x="4.25" y="4" width="2.5" height="6.5" rx="0.5" fill={showStats?'#4db8ff':'#4a7898'}/>
                  <rect x="7.5" y="1" width="2.5" height="9.5" rx="0.5" fill={showStats?'#4db8ff':'#4a7898'}/>
                </svg>
              </button>
              {/* Combined LOG+FILTER button */}
              <button onClick={e=>{e.stopPropagation();
                if(showLog||showFilters){setShowLog(false);setShowFilters(false);}
                else{setShowLog(true);setShowStats(false);}
              }} style={{
                background:(showLog||showFilters)?'rgba(77,184,255,0.1)':'transparent',
                border:`1px solid ${(showLog||showFilters||isFilterActive)?'rgba(77,184,255,0.45)':'rgba(77,184,255,0.2)'}`,
                borderRadius:5,padding:'5px 6px',cursor:'pointer',
                display:'flex',alignItems:'center',gap:4,position:'relative'}}>
                {/* Lines icon */}
                <svg width="11" height="10" viewBox="0 0 11 10">
                  <rect x="0" y="0" width="11" height="1.5" rx="0.75" fill={(showLog||showFilters)?'#4db8ff':'#4a7898'}/>
                  <rect x="0" y="4" width="11" height="1.5" rx="0.75" fill={(showLog||showFilters)?'#4db8ff':'#4a7898'}/>
                  <rect x="0" y="8" width="7"  height="1.5" rx="0.75" fill={(showLog||showFilters)?'#4db8ff':'#4a7898'}/>
                </svg>
                {/* Filter dot when active */}
                {isFilterActive&&<div style={{width:5,height:5,borderRadius:'50%',
                  background:'#4db8ff',border:'1px solid #010a18',flexShrink:0}}/>}
                {/* Tail count badge */}
                {logbook.length>0&&<div style={{position:'absolute',top:-4,right:-4,
                  background:'#4db8ff',borderRadius:'50%',width:14,height:14,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:9,color:'#010a18',fontFamily:"'Orbitron',monospace",fontWeight:700,
                  border:'1.5px solid #010a18'}}>{Math.min(logbook.reduce((s,e)=>s+(e.tails?.length||1),0),99)}</div>}
              </button>
            </div>
            <div style={{fontSize:11,color:'#5a8898',fontFamily:"'Orbitron',monospace"}}>{mapped.length} IN VIEW</div>
          </div>
        </div>
      </div>

      {/* Combined LOG / FILTER tabbed panel */}
      {(showLog||showFilters)&&(
        <div onClick={e=>e.stopPropagation()} style={{
          position:'absolute',inset:0,zIndex:60,display:'flex',flexDirection:'column',
          background:'rgba(1,6,18,0.98)',animation:'slideUp 0.28s ease'}}>
          {/* Tab bar */}
          <div style={{display:'flex',alignItems:'stretch',flexShrink:0,
            borderBottom:'1px solid rgba(77,184,255,0.14)',background:'rgba(1,6,18,0.99)'}}>
            {[['log','LOG'],['filter','FILTER']].map(([t,label])=>(
              <button key={t} onClick={()=>{
                setShowLog(t==='log'); setShowFilters(t==='filter');
              }} style={{
                flex:1,padding:'11px 0',background:'transparent',border:'none',
                borderBottom:`2px solid ${
                  (t==='log'&&showLog)||(t==='filter'&&showFilters)
                    ?'#4db8ff':'transparent'}`,
                cursor:'pointer',
                fontSize:10,fontFamily:"'Orbitron',monospace",letterSpacing:'.14em',
                color:(t==='log'&&showLog)||(t==='filter'&&showFilters)?'#b8e4ff':'#3a6878',
                fontWeight:(t==='log'&&showLog)||(t==='filter'&&showFilters)?700:400,
              }}>
                {label}
                {t==='filter'&&isFilterActive&&(
                  <span style={{display:'inline-block',width:5,height:5,borderRadius:'50%',
                    background:'#4db8ff',marginLeft:5,verticalAlign:'middle',
                    position:'relative',top:-1}}/>
                )}
              </button>
            ))}
            <button onClick={()=>{setShowLog(false);setShowFilters(false);}} style={{
              background:'transparent',border:'none',borderLeft:'1px solid rgba(77,184,255,0.12)',
              color:'#3a6878',fontSize:16,cursor:'pointer',padding:'0 16px',
              fontFamily:"'Orbitron',monospace"}}>✕</button>
          </div>
          {/* Content — each component fills remaining space */}
          <div style={{flex:1,overflow:'hidden',position:'relative'}}>
            {showFilters&&<FilterPanel altFloor={altFloor} altCeiling={altCeiling}
              onFloor={setAltFloor} onCeiling={setAltCeiling}
              search={search} onSearch={setSearch} allFlights={flights} pos={pos}
              onSelect={handleSelectFlight}
              typeFilter={typeFilter} onTypeFilter={setTypeFilter}
              minSpeedKts={minSpeedKts} maxSpeedKts={maxSpeedKts}
              onMinSpd={setMinSpeedKts} onMaxSpd={setMaxSpeedKts}
              maxDisplayNmi={maxDisplayNmi} onMaxDist={setMaxDisplayNmi}
              onResetAll={handleResetAllFilters}
              onClose={()=>{setShowLog(false);setShowFilters(false);}}/>}
            {showLog&&<Logbook entries={logbook} proximityNmi={proximityNmi}
              onProxChange={handleProxChange}
              onClose={()=>{setShowLog(false);setShowFilters(false);}}
              onClear={()=>{saveLog([]);setLogbook([]);historicTails.current=new Set();
                activeEncounters.current.clear();lastLoggedTime.current.clear();}}/>}
          </div>
        </div>
      )}

      {/* North indicator — scan mode only, fixed true-north arrow */}
      {!tiltMode&&!cameraMode&&(
        <div style={{position:'absolute',right:12,bottom:140,zIndex:10,pointerEvents:'none'}}>
          <div style={{width:38,height:38,borderRadius:'50%',
            background:'rgba(1,8,20,0.78)',
            border:'1px solid rgba(77,184,255,0.22)',
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="28" height="28" viewBox="-14 -14 28 28"
              style={{transform:`rotate(${-scanHeading}deg)`,transition:'transform 0.25s ease'}}>
              {/* North (red) needle half */}
              <polygon points="0,-10 2.8,-2 0,-5 -2.8,-2" fill="#e87070"/>
              {/* South (blue) needle half */}
              <polygon points="0,10 2.8,2 0,5 -2.8,2" fill="rgba(77,184,255,0.45)"/>
              {/* Center pivot */}
              <circle cx="0" cy="0" r="1.5" fill="rgba(255,255,255,0.5)"/>
              {/* N label */}
              <text x="0" y="-11.5" textAnchor="middle" fontSize="5"
                fill="#e87070" fontFamily="Orbitron,monospace" fontWeight="700">N</text>
            </svg>
          </div>
        </div>
      )}

      {/* Auto-range notification banner */}
      {rangeNote&&(
        <div style={{position:'absolute',top:58,left:'50%',transform:'translateX(-50%)',
          zIndex:40,background:'rgba(255,185,50,0.92)',borderRadius:6,
          padding:'5px 14px',pointerEvents:'none',
          animation:'slideDown 0.3s ease',
          fontSize:9,fontFamily:"'Orbitron',monospace",color:'#1a0800',
          fontWeight:700,letterSpacing:'.06em',whiteSpace:'nowrap'}}>
          ⚠ {rangeNote}
        </div>
      )}

      {/* Trail lines — draw behind markers */}
      <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:3,overflow:'hidden'}}>
        {mapped.map(f=>{
          if(!f.trail?.length) return null;
          const col=altColor(f.alt);
          // pts: [oldest_prev, ..., prev, current]
          const pts=[...f.trail,{x:f.x,y:f.y}];
          const n=pts.length-1; // number of segments
          return pts.slice(1).map((pt,i)=>(
            <line key={`${f.id}-t${i}`}
              x1={`${pts[i].x}%`} y1={`${pts[i].y}%`}
              x2={`${pt.x}%`}     y2={`${pt.y}%`}
              stroke={col}
              strokeWidth={1.5 + (i/n)*1.5}
              strokeLinecap='round'
              opacity={0.28 + (i/n)*0.42}
            />
          ));
        })}
      </svg>

      {/* Aircraft markers */}
      {mapped.map(f=>(
        <AircraftMarker key={f.id} f={f} isSelected={selectedId===f.id}
          dimmed={selectedId!==null&&selectedId!==f.id}
          tiltMode={tiltMode}
          onSelect={handleAircraftSelect}
          loggedCallsigns={loggedCallsigns} loggedTypes={loggedTypes}
          proximityM={proximityM}
          isDisplayNew={displayNewIds.has(f.id)}/>
      ))}

      {/* Altitude legend */}
      {/* Range ring dial */}
      <div style={{position:'absolute',right:12,bottom:155,zIndex:10,
        background:'rgba(1,8,22,0.78)',borderRadius:'50%',
        border:'0.5px solid rgba(77,184,255,0.12)',
        boxShadow:'0 0 12px rgba(0,0,0,0.5)'}}>
        <RingRangeControl value={maxDisplayNmi} min={10} max={DIST_MAX}
          onChange={setMaxDisplayNmi}/>
      </div>

      <div style={{position:'absolute',left:10,bottom:155,zIndex:10,
        background:'rgba(1,9,22,.8)',borderRadius:8,padding:'7px 10px',
        border:'0.5px solid rgba(77,184,255,.12)'}}>
        {[
          ['45k+','#e879f9',47000],
          ['38k', '#a855f7',39500],
          ['32k', '#e8f4ff',34000],
          ['25k', '#b8e4ff',28000],
          ['18k', '#4db8ff',21000],
          ['10k', '#2b9de0',13000],
          ['<10k','#0ea5e9', 4500],
        ].map(([lbl,col,bft])=>(
          <div key={lbl} style={{display:'flex',alignItems:'center',gap:5,marginBottom:4,
            opacity:bft<altFloor||bft>altCeiling?0.22:1,transition:'opacity 0.3s'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:col,flexShrink:0}}/>
            <span style={{fontSize:10,color:'#5a98b0',fontFamily:"'Orbitron',monospace",letterSpacing:'.05em'}}>{lbl} ft</span>
          </div>
        ))}
      </div>

      {/* Toast notifications */}
      <Toasts items={toasts}/>

      {showHint&&!tiltMode&&(
        <div style={{position:'absolute',top:'44%',left:'50%',transform:'translateX(-50%)',
          zIndex:5,pointerEvents:'none',textAlign:'center'}}>
          <div style={{fontSize:11,color:'rgba(77,184,255,.5)',fontFamily:"'Orbitron',monospace",
            letterSpacing:'.12em',whiteSpace:'nowrap'}}>TAP AIRCRAFT FOR DETAILS</div>
        </div>
      )}

      {/* ── BOTTOM HUD ── */}
      <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10,
        background:'linear-gradient(0deg,rgba(1,7,18,.97) 0%,transparent 100%)',
        padding:'18px 16px 8px'}}>
        <CompassStrip heading={viewHdg}/>
        <div style={{display:'flex',justifyContent:'space-between',padding:'8px 6px 4px'}}>
          {[
            ['HEADING',(Math.round(heading)%360).toString().padStart(3,'0')+'\u00b0'],
            ['IN VIEW',String(mapped.length)],
            [tiltMode?'AIM ELEV':'MAX RANGE', tiltMode?Math.round(devicePitch)+'\u00b0':maxRange+' nmi'],
          ].map(([lbl,val])=>(
            <div key={lbl} style={{textAlign:'center'}}>
              <div style={{fontSize:9,color:'#4a7888',fontFamily:"'Orbitron',monospace",letterSpacing:'.1em',marginBottom:3}}>{lbl}</div>
              <div style={{fontSize:13,color:'#8ac4e0',fontFamily:"'Orbitron',monospace",fontWeight:600}}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{textAlign:'center',fontSize:9,color:'rgba(77,184,255,.3)',fontFamily:"'Orbitron',monospace",letterSpacing:'.08em',marginTop:2}}>
          {tiltMode?'TILT PHONE TO AIM · TAP AIRCRAFT FOR DETAILS':'DRAG TO SCAN · TAP AIRCRAFT FOR DETAILS'}
        </div>
      </div>

      {selected&&<FlightCard f={selected} onClose={()=>setSelectedId(null)} loggedCallsigns={loggedCallsigns}/>}
      {/* FOV calibration panel — slides up from bottom when open */}
      {(cameraMode||tiltMode)&&showCalib&&(
        <div onClick={e=>e.stopPropagation()} style={{
          position:'absolute',bottom:0,left:0,right:0,zIndex:55,
          background:'rgba(1,6,18,0.94)',
          borderTop:'1px solid rgba(45,255,180,0.3)',
          padding:'14px 16px 20px',
          animation:'slideUp 0.22s ease',
        }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:11,fontFamily:"'Orbitron',monospace",fontWeight:700,
              color:'#2dffb4',letterSpacing:'.15em'}}>AR CALIBRATION</div>
            <button onClick={()=>setShowCalib(false)} style={{background:'transparent',
              border:'1px solid rgba(77,184,255,0.2)',borderRadius:5,color:'#5a8898',
              fontSize:11,cursor:'pointer',padding:'3px 8px',fontFamily:"'Orbitron',monospace"}}>✕</button>
          </div>
          <div style={{fontSize:9,color:'#5a8898',fontFamily:"'Exo 2',sans-serif",marginBottom:10,lineHeight:1.5}}>
            Find a visible aircraft. Adjust sliders until the icon lines up with it in the sky.
          </div>
          {/* FOV slider */}
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
            <span style={{fontSize:8,color:'#4a7898',fontFamily:"'Orbitron',monospace",width:32}}>WIDE</span>
            <input type="range" min="40" max="110" step="1" value={Math.round(arFov)}
              onChange={e=>setArFov(parseFloat(e.target.value))}
              style={{flex:1,accentColor:'#2dffb4'}}/>
            <span style={{fontSize:8,color:'#4a7898',fontFamily:"'Orbitron',monospace",width:32,textAlign:'right'}}>NARROW</span>
          </div>
          <div style={{textAlign:'center',fontSize:16,fontFamily:"'Orbitron',monospace",
            fontWeight:700,color:'#2dffb4',marginBottom:12}}>{Math.round(arFov)}°</div>
          {/* Reference values */}
          <div style={{fontSize:8,color:'#3a6878',fontFamily:"'Orbitron',monospace",
            letterSpacing:'.06em',marginBottom:10,lineHeight:1.8}}>
            REFERENCE: iPhone 0.5× ≈ 105° · 1× ≈ 77° · 2× ≈ 50° · 3× ≈ 35°
          </div>


          {/* Action buttons */}
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setArFov(camFov)} style={{
              flex:1,padding:'7px',background:'transparent',
              border:'1px solid rgba(77,184,255,0.2)',borderRadius:6,
              color:'#4a7898',fontSize:9,cursor:'pointer',fontFamily:"'Orbitron',monospace"}}>
              RESET
            </button>
            <button onClick={()=>{
              const v=arFov;
              setCamFov(v);
              try{localStorage.setItem('soratomo_cam_fov',String(v));}catch{}
              setShowCalib(false);
            }} style={{
              flex:2,padding:'7px',background:'rgba(45,255,180,0.12)',
              border:'1.5px solid #2dffb4',borderRadius:6,
              color:'#2dffb4',fontSize:9,cursor:'pointer',fontFamily:"'Orbitron',monospace",fontWeight:700}}>
              SAVE AS DEFAULT
            </button>
          </div>
        </div>
      )}

      {showGallery&&<Gallery
        photos={gallery} selected={galSelected} onSelect={setGalSelected}
        onClose={()=>{setShowGallery(false);setGalSelected(null);}}
        onDelete={id=>setGallery(prev=>{const n=prev.filter(p=>p.id!==id);saveGallery(n);return n;})}
        onClear={()=>setGallery(prev=>{saveGallery([]);return [];})}
      />}
      {showStats&&<Stats entries={logbook} onClose={()=>setShowStats(false)}/>}

      {/* Disclaimer — shown once per session, must be acknowledged */}
      {showDisclaimer&&<Disclaimer onAccept={()=>{
        sessionStorage.setItem(DISCLAIMER_KEY,'1');
        setShowDisclaimer(false);
        // Hold tagline for 4s, then fade over 1.5s, then hide
        setTimeout(()=>setTaglineOpacity(0), 4000);
      }}/>}
    </div>
  );
}
