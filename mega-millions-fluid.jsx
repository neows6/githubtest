import { useState, useMemo, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// DATA — LottoAmerica.com · 3,019 draws · Sep 6 1996 → Apr 24 2026
// [num, allTimeFreq, drawsAgo]
// ═══════════════════════════════════════════════════════════════════════════════
const BALL_DATA = [
  [1,242,1],[2,267,29],[3,258,5],[4,268,9],[5,258,5],[6,251,13],[7,246,1],
  [8,253,15],[9,238,31],[10,281,39],[11,270,11],[12,248,17],[13,250,9],
  [14,269,49],[15,244,5],[16,250,1],[17,285,3],[18,257,5],[19,229,13],
  [20,274,11],[21,250,3],[22,265,5],[23,226,45],[24,268,3],[25,255,21],
  [26,249,15],[27,255,9],[28,253,9],[29,269,77],[30,245,13],[31,288,7],
  [32,252,1],[33,237,5],[34,222,21],[35,258,1],[36,246,1],[37,241,5],
  [38,271,3],[39,267,17],[40,255,1],[41,233,9],[42,268,5],[43,242,1],
  [44,253,3],[45,236,7],[46,272,37],[47,236,27],[48,265,19],[49,233,3],
  [50,247,11],[51,210,11],[52,206,9],[53,180,9],[54,155,15],[55,140,11],
  [56,169,1],[57,89,3],[58,104,1],[59,89,21],[60,76,7],[61,81,51],
  [62,94,3],[63,85,7],[64,93,29],[65,74,7],[66,101,25],[67,68,17],
  [68,87,7],[69,88,3],[70,83,27],
];
const MEGA_DATA = [
  [1,117,21],[2,100,5],[3,117,81],[4,108,11],[5,85,25],[6,105,5],
  [7,113,1],[8,97,3],[9,116,13],[10,110,9],[11,100,77],[12,98,1],
  [13,103,25],[14,91,19],[15,107,7],[16,69,9],[17,81,7],[18,80,37],
  [19,82,23],[20,76,87],[21,83,23],[22,89,65],[23,61,17],[24,95,11],
];
const ENTANGLED_PAIRS = [[18,31],[29,32],[17,21],[8,10],[16,36],[4,34],[6,26],[10,40],[14,46],[31,46]];
const JACKPOT_M = 163;
const TOTAL_DRAWS = 3019;

function modelFluid(data, poolSize, ballsPerDraw) {
  const freqs = data.map(d => d[1]);
  const fMean = freqs.reduce((a,b)=>a+b,0)/freqs.length;
  const fMax  = Math.max(...freqs), fMin = Math.min(...freqs);
  const rho=1, mu=0.08, L=poolSize;
  return data.map(([num,freq,ago]) => {
    const P  = freq/fMean;
    const ei = poolSize/ballsPerDraw;
    const v  = Math.min(ei/(ago+1), 3.0);
    const Re = rho*v*L/mu;
    const B  = P + 0.5*rho*v*v;
    const w  = Math.abs(P-1);
    const od = ago>ei*2 ? 0.25*Math.min(ago/(ei*8),0.5) : 0;
    const score = 0.38*v + 0.30*P + 0.18*(1/(w+0.4)) + 0.09*(freq/fMax) + 0.05*((freq-fMin)/(fMax-fMin+1)) + od;
    const regime = Re>4000?"turbulent":Re>2300?"transitional":"laminar";
    return { num, freq, ago, score, P, v, Re, B, w, regime,
             metrics:[["Pressure P",P.toFixed(4)],["Velocity v",v.toFixed(4)],
                      ["Reynolds Re",Math.round(Re)],["Bernoulli B",B.toFixed(4)],
                      ["Vorticity ω",w.toFixed(4)],["NS-Score",score.toFixed(5)]] };
  });
}

function modelSmart(data, poolSize, ballsPerDraw) {
  const freqs = data.map(d=>d[1]);
  const fMax  = Math.max(...freqs);
  const ei    = poolSize/ballsPerDraw;
  const popularityWeight = (n) => {
    let w = 1.0;
    if (n <= 31)  w *= 1.85;
    if (n <= 12)  w *= 1.20;
    if (n % 10 === 0) w *= 1.30;
    if ([7,11,13,17,21,23].includes(n)) w *= 1.40;
    return w;
  };
  return data.map(([num,freq,ago]) => {
    const compression = Math.max(ago - ei, 0);
    const springE    = 0.5 * compression * compression / (ei * ei);
    const expectedFreq = TOTAL_DRAWS / poolSize * ballsPerDraw;
    const freqDeficit  = Math.max(expectedFreq - freq, 0) / expectedFreq;
    const pop    = popularityWeight(num);
    const unpop  = 1 / pop;
    const recencyPenalty = ago < 3 ? 0.15 * (3 - ago) : 0;
    const evBonus = JACKPOT_M > 700 ? 0.1 : JACKPOT_M > 400 ? 0.05 : 0;
    const score = 0.35*springE + 0.25*unpop + 0.20*freqDeficit
                + 0.15*((freq-Math.min(...freqs))/(fMax-Math.min(...freqs)+1))
                + 0.05*evBonus - recencyPenalty;
    const tag = pop>1.5?"⚠ Overplayed":pop>1.2?"△ Popular":"✓ Contrarian";
    return { num, freq, ago, score, springE, unpop, freqDeficit, pop, tag,
             metrics:[["Spring Energy",springE.toFixed(4)],["Unpopularity",unpop.toFixed(4)],
                      ["Freq Deficit",freqDeficit.toFixed(4)],["Pop Weight",pop.toFixed(2)],
                      ["EV Bonus",evBonus.toFixed(2)],["Smart Score",score.toFixed(5)]] };
  });
}

function modelQuantum(data, poolSize, ballsPerDraw) {
  const freqs = data.map(d=>d[1]);
  const fTotal = freqs.reduce((a,b)=>a+b,0);
  const ei = poolSize/ballsPerDraw;
  const entangleBoost = {};
  ENTANGLED_PAIRS.forEach(([a,b]) => {
    entangleBoost[a] = (entangleBoost[a]||0) + 0.08;
    entangleBoost[b] = (entangleBoost[b]||0) + 0.08;
  });
  return data.map(([num,freq,ago]) => {
    const amplitude = Math.sqrt(freq / fTotal);
    const theta = (2 * Math.PI * ago) / ei;
    const psiReal = amplitude * Math.cos(theta);
    const psiImag = amplitude * Math.sin(theta);
    const probRaw = psiReal*psiReal + psiImag*psiImag;
    const interference = Math.cos(theta);
    const expectedF   = fTotal / poolSize;
    const barrier     = Math.max(expectedF - freq, 0) / expectedF;
    const kappa       = 1.8;
    const tunneling   = Math.exp(-kappa * barrier) * 0.12;
    const decoherence = ago < 4 ? Math.exp(-(4-ago)*0.4) : 1.0;
    const entanglement = entangleBoost[num] || 0;
    const hbar   = 0.5;
    const omega  = 2*Math.PI/ei;
    const Ekin   = 0.5 * hbar * omega * omega * amplitude * amplitude;
    const Epot   = 1/(ago+1);
    const Etotal = Ekin + Epot;
    const score = (probRaw * (1 + interference * 0.5) + tunneling + entanglement)
                * decoherence + 0.15 * Etotal;
    const state = ago < 4 ? "COLLAPSED" : interference > 0.3 ? "RESONANT"
                : interference < -0.3 ? "DESTRUCTIVE" : "SUPERPOSED";
    return { num, freq, ago, score, amplitude, theta, probRaw, interference,
             tunneling, decoherence, entanglement, Etotal, state,
             metrics:[["Amplitude |ψ|",amplitude.toFixed(5)],
                      ["Phase θ (rad)",(theta%(2*Math.PI)).toFixed(4)],
                      ["Interference",interference.toFixed(4)],
                      ["Tunneling",tunneling.toFixed(4)],
                      ["Decoherence",decoherence.toFixed(4)],
                      ["QE Score",score.toFixed(5)]] };
  });
}

function applyBalanceFilter(candidates) {
  const pool = candidates.slice(0, 20);
  let best = null, bestBalance = -Infinity;
  const top12 = pool.slice(0,12).map(s=>s.num);
  for (let a=0;a<top12.length;a++)
  for (let b=a+1;b<top12.length;b++)
  for (let c=b+1;c<top12.length;c++)
  for (let d=c+1;d<top12.length;d++)
  for (let e=d+1;e<top12.length;e++) {
    const combo = [top12[a],top12[b],top12[c],top12[d],top12[e]];
    const sum   = combo.reduce((x,y)=>x+y,0);
    const odds  = combo.filter(n=>n%2!==0).length;
    const lows  = combo.filter(n=>n<=35).length;
    const sumOK  = sum>=100 && sum<=175 ? 1 : 0;
    const oddOK  = odds>=2 && odds<=3  ? 1 : 0;
    const lowOK  = lows>=2 && lows<=3  ? 1 : 0;
    const totalS = pool.filter(s=>combo.includes(s.num)).reduce((x,s)=>x+s.score,0);
    const balance = sumOK*2 + oddOK*1.5 + lowOK*1.5 + totalS*0.5;
    if (balance > bestBalance) { bestBalance=balance; best=combo; }
  }
  return best ? best.sort((a,b)=>a-b) : candidates.slice(0,5).map(s=>s.num).sort((a,b)=>a-b);
}

const THEME = {
  fluid:   { primary:"#00e5ff", secondary:"#0090b8", glow:"rgba(0,229,255,0.4)",   bg:"rgba(0,40,80,0.7)",   border:"rgba(0,200,255,0.25)" },
  smart:   { primary:"#00e676", secondary:"#007a40", glow:"rgba(0,230,118,0.4)",   bg:"rgba(0,50,20,0.7)",   border:"rgba(0,200,100,0.25)" },
  quantum: { primary:"#e040fb", secondary:"#7b1fa2", glow:"rgba(224,64,251,0.4)",  bg:"rgba(40,0,60,0.7)",   border:"rgba(200,50,250,0.25)" },
  gold:    { primary:"#ffd600", glow:"rgba(255,214,0,0.4)" },
};
const MODEL_THEMES = ["fluid","smart","quantum"];
const MODEL_LABELS = ["⚗ Fluid Dynamics","🎯 Smart Play","⚛ Quantum"];
const MODEL_SUBTITLES = [
  "Navier-Stokes · Bernoulli · Reynolds",
  "Spring Pressure · Split Avoidance · EV Filter",
  "Wave Function · Entanglement · Tunneling",
];

export default function TriModelPredictor() {
  const [activeTab, setActiveTab] = useState("compare");
  const [selectedBall, setSelectedBall] = useState(null);
  const [tick, setTick] = useState(0);
  const [showEV, setShowEV] = useState(false);

  useEffect(()=>{
    const id=setInterval(()=>setTick(t=>t+1),2000);
    return ()=>clearInterval(id);
  },[]);

  const fluidBalls  = useMemo(()=>modelFluid(BALL_DATA,70,5),[]);
  const smartBalls  = useMemo(()=>modelSmart(BALL_DATA,70,5),[]);
  const quantumBalls= useMemo(()=>modelQuantum(BALL_DATA,70,5),[]);
  const fluidMB     = useMemo(()=>modelFluid(MEGA_DATA,24,1),[]);
  const smartMB     = useMemo(()=>modelSmart(MEGA_DATA,24,1),[]);
  const quantumMB   = useMemo(()=>modelQuantum(MEGA_DATA,24,1),[]);

  const predictions = useMemo(()=>{
    const fTop  = [...fluidBalls].sort((a,b)=>b.score-a.score);
    const sTop  = [...smartBalls].sort((a,b)=>b.score-a.score);
    const qTop  = [...quantumBalls].sort((a,b)=>b.score-a.score);
    return [
      { main: fTop.slice(0,5).map(s=>s.num).sort((a,b)=>a-b),
        mega: [...fluidMB].sort((a,b)=>b.score-a.score)[0].num },
      { main: applyBalanceFilter(sTop),
        mega: [...smartMB].sort((a,b)=>b.score-a.score)[0].num },
      { main: qTop.slice(0,5).map(s=>s.num).sort((a,b)=>a-b),
        mega: [...quantumMB].sort((a,b)=>b.score-a.score)[0].num },
    ];
  },[fluidBalls,smartBalls,quantumBalls,fluidMB,smartMB,quantumMB]);

  const allScores = [fluidBalls, smartBalls, quantumBalls];
  const allMB     = [fluidMB, smartMB, quantumMB];

  const ticketCost = 2;
  const jackpotEV = (JACKPOT_M*1e6 * 0.60 * 0.63) / 302575350;
  const netEV = jackpotEV - ticketCost;
  const evPositive = netEV > 0;

  const S = {
    root: {
      background:"linear-gradient(160deg,#020812 0%,#05101e 40%,#030a18 100%)",
      minHeight:"100vh", fontFamily:"'Courier New',monospace",
      color:"#8ab4d8", padding:"16px", position:"relative", overflow:"hidden",
    },
    panel: (theme="fluid") => ({
      background: THEME[theme].bg,
      border:`1px solid ${THEME[theme].border}`,
      borderRadius:"8px", padding:"14px", marginBottom:"12px",
      backdropFilter:"blur(8px)", position:"relative", zIndex:1,
    }),
    label: (color="#2a5a90") => ({
      fontSize:"8px", letterSpacing:"0.35em", color,
      textTransform:"uppercase", marginBottom:"10px", display:"block",
    }),
  };

  const Ball = ({num, modelIdx, size=60, showRank=false, rank=0, freq, isMega=false})=>{
    const t   = isMega ? THEME.gold : THEME[MODEL_THEMES[modelIdx]];
    const sel = selectedBall?.modelIdx===modelIdx && selectedBall?.num===num;
    return (
      <div onClick={()=>setSelectedBall(sel?null:{modelIdx,num})}
        style={{textAlign:"center",cursor:"pointer",userSelect:"none"}}>
        {showRank&&<div style={{fontSize:"7px",color:"#1e3a50",marginBottom:"3px",letterSpacing:"0.1em"}}>
          #{rank}
        </div>}
        <div style={{
          width:`${size}px`,height:`${size}px`,borderRadius:"50%",
          background:`radial-gradient(circle at 35% 35%,${isMega?"#1a0800":"#010610"},#010408)`,
          border:`${sel?"3":"2"}px solid ${t.primary}`,
          boxShadow:sel
            ?`0 0 0 3px ${t.glow},0 0 25px ${t.glow},0 0 50px ${t.glow}`
            :`0 0 15px ${t.glow},0 0 30px ${t.glow}88`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:`${size*0.32}px`,fontWeight:"900",color:t.primary,
          margin:"0 auto",transition:"all 0.2s",
          animation:`ballGlow${modelIdx} 2.5s ease-in-out infinite`,
        }}>{num}</div>
        {freq!==undefined&&<div style={{fontSize:"6px",color:"#1a3050",marginTop:"2px"}}>{freq}×</div>}
      </div>
    );
  };

  return (
    <div style={S.root}>
      <style>{`
        @keyframes shimmer{0%{background-position:0% 50%}100%{background-position:300% 50%}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes flowIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ballGlow0{0%,100%{box-shadow:0 0 15px rgba(0,229,255,0.35),0 0 30px rgba(0,229,255,0.2)}
                              50%{box-shadow:0 0 22px rgba(0,229,255,0.7),0 0 44px rgba(0,229,255,0.35)}}
        @keyframes ballGlow1{0%,100%{box-shadow:0 0 15px rgba(0,230,118,0.35),0 0 30px rgba(0,230,118,0.2)}
                              50%{box-shadow:0 0 22px rgba(0,230,118,0.7),0 0 44px rgba(0,230,118,0.35)}}
        @keyframes ballGlow2{0%,100%{box-shadow:0 0 15px rgba(224,64,251,0.35),0 0 30px rgba(224,64,251,0.2)}
                              50%{box-shadow:0 0 22px rgba(224,64,251,0.7),0 0 44px rgba(224,64,251,0.35)}}
        @keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        @keyframes quantumFlicker{0%,100%{opacity:1}48%{opacity:0.95}50%{opacity:0.7}52%{opacity:0.95}}
        .tab-s{animation:flowIn 0.3s ease}
      `}</style>

      <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
        <div style={{position:"absolute",left:0,right:0,height:"2px",
          background:"linear-gradient(transparent,rgba(0,150,255,0.04),transparent)",
          animation:"scanline 8s linear infinite"}}/>
        <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,
          background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,80,180,0.011) 2px,rgba(0,80,180,0.011) 4px)"}}/>
      </div>

      <div style={{textAlign:"center",marginBottom:"16px",position:"relative",zIndex:1}}>
        <div style={{fontSize:"clamp(13px,3vw,22px)",fontWeight:"900",letterSpacing:"0.18em",textTransform:"uppercase",
          background:"linear-gradient(90deg,#00e5ff,#00e676,#e040fb,#00e5ff)",
          backgroundSize:"300% 100%",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
          animation:"shimmer 5s linear infinite"}}>
          ⚡ MEGA MILLIONS · TRI-MODEL PREDICTION SYSTEM ⚡
        </div>
        <div style={{fontSize:"8px",color:"#2a4a6a",letterSpacing:"0.25em",marginTop:"4px"}}>
          THREE INDEPENDENT MODELS · {TOTAL_DRAWS.toLocaleString()} DRAWS · SEP 1996 → APR 2026
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:"8px",marginTop:"8px",flexWrap:"wrap"}}>
          {[0,1,2].map(i=>(
            <div key={i} style={{background:THEME[MODEL_THEMES[i]].bg,
              border:`1px solid ${THEME[MODEL_THEMES[i]].border}`,
              borderRadius:"16px",padding:"4px 12px",textAlign:"center",minWidth:"140px"}}>
              <div style={{fontSize:"9px",color:THEME[MODEL_THEMES[i]].primary,fontWeight:"bold",letterSpacing:"0.1em"}}>
                {MODEL_LABELS[i]}
              </div>
              <div style={{fontSize:"7px",color:"#1e3a50",marginTop:"1px"}}>{MODEL_SUBTITLES[i]}</div>
            </div>
          ))}
          <div onClick={()=>setShowEV(!showEV)} style={{
            background:evPositive?"rgba(0,50,20,0.7)":"rgba(50,10,0,0.7)",
            border:`1px solid ${evPositive?"rgba(0,200,100,0.3)":"rgba(200,50,0,0.3)"}`,
            borderRadius:"16px",padding:"4px 12px",textAlign:"center",cursor:"pointer",minWidth:"120px"}}>
            <div style={{fontSize:"9px",color:evPositive?"#00e676":"#ff6b35",fontWeight:"bold"}}>
              {evPositive?"✓ EV POSITIVE":"✗ EV NEGATIVE"}
            </div>
            <div style={{fontSize:"7px",color:"#1e3a50",marginTop:"1px"}}>${JACKPOT_M}M jackpot · click</div>
          </div>
        </div>
        {showEV && (
          <div style={{...S.panel(evPositive?"smart":"fluid"),maxWidth:"440px",margin:"8px auto 0",
            animation:"flowIn 0.25s ease",textAlign:"left"}}>
            <span style={S.label(evPositive?"#00e676":"#ff6b35")}>· Expected Value Analysis ·</span>
            {[
              ["Jackpot",`$${JACKPOT_M}M`],["Lump sum (60%)",`$${(JACKPOT_M*0.6).toFixed(1)}M`],
              ["After 37% tax (63%)",`$${(JACKPOT_M*0.6*0.63).toFixed(1)}M`],
              ["Odds","1 in 302,575,350"],["EV per $2 ticket",`$${jackpotEV.toFixed(4)}`],
              ["Net EV",`${netEV>=0?"+":""}$${netEV.toFixed(4)}`],["Break-even jackpot","~$700M"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",
                padding:"2px 0",borderBottom:"1px solid rgba(0,100,200,0.1)"}}>
                <span style={{fontSize:"9px",color:"#2a5070"}}>{k}</span>
                <span style={{fontSize:"9px",color:k==="Net EV"?(netEV>=0?"#00e676":"#ff6b35"):"#82b1ff"}}>{v}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{fontSize:"7px",color:"#0c1d2e",marginTop:"6px",letterSpacing:"0.15em"}}>
          ⚠ ENTERTAINMENT ONLY · EACH DRAW IS STATISTICALLY INDEPENDENT · 1-IN-302,575,350 ODDS
        </div>
      </div>

      <div style={{display:"flex",gap:"6px",justifyContent:"center",marginBottom:"14px",
                   position:"relative",zIndex:1,flexWrap:"wrap"}}>
        {["compare","fluid","smart","quantum"].map((t,i)=>{
          const active = activeTab===t;
          const themeKey = i===0?"fluid":MODEL_THEMES[i-1];
          const color = active ? THEME[themeKey].primary : "#2a4a6a";
          return (
            <button key={t} onClick={()=>setActiveTab(t)} style={{
              padding:"6px 14px",fontSize:"9px",letterSpacing:"0.2em",textTransform:"uppercase",
              background:active?`${THEME[themeKey].primary}18`:"transparent",
              border:active?`1px solid ${THEME[themeKey].primary}99`:"1px solid rgba(0,80,150,0.25)",
              color,borderRadius:"4px",cursor:"pointer",transition:"all 0.2s",
            }}>{i===0?"⊞ Compare":MODEL_LABELS[i-1]}</button>
          );
        })}
      </div>

      {activeTab==="compare" && (
        <div className="tab-s" style={{position:"relative",zIndex:1}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"14px"}}>
            {[0,1,2].map(mi=>{
              const t=THEME[MODEL_THEMES[mi]], p=predictions[mi], scores=allScores[mi];
              const mb=allMB[mi].find(s=>s.num===p.mega);
              return (
                <div key={mi} style={{...S.panel(MODEL_THEMES[mi]),textAlign:"center"}}>
                  <div style={{fontSize:"9px",color:t.primary,fontWeight:"bold",letterSpacing:"0.15em",marginBottom:"2px"}}>{MODEL_LABELS[mi]}</div>
                  <div style={{fontSize:"7px",color:"#1e3a50",marginBottom:"12px",lineHeight:1.5}}>{MODEL_SUBTITLES[mi]}</div>
                  <div style={{display:"flex",justifyContent:"center",gap:"6px",flexWrap:"wrap",marginBottom:"10px"}}>
                    {p.main.map(n=><Ball key={n} num={n} modelIdx={mi} size={48} freq={scores.find(s=>s.num===n)?.freq}/>)}
                  </div>
                  <div style={{borderTop:`1px solid ${t.border}`,paddingTop:"8px",marginBottom:"8px"}}>
                    <div style={{fontSize:"7px",color:"#3a2000",marginBottom:"4px",letterSpacing:"0.15em"}}>MEGA BALL</div>
                    <Ball num={p.mega} modelIdx={mi} isMega={true} size={44} freq={mb?.freq}/>
                  </div>
                  <div style={{fontSize:"8px",color:t.primary,letterSpacing:"0.1em",fontWeight:"bold",borderTop:`1px solid ${t.border}`,paddingTop:"6px"}}>
                    {p.main.join(" · ")} + MB{p.mega}
                  </div>
                </div>
              );
            })}
          </div>
          {(()=>{
            const countMap={};
            predictions.forEach(p=>p.main.forEach(n=>{countMap[n]=(countMap[n]||0)+1;}));
            const consensus=Object.entries(countMap).filter(([,c])=>c>=2).map(([n,c])=>({n:+n,c})).sort((a,b)=>b.c-a.c);
            const mbCount={};
            predictions.forEach(p=>{mbCount[p.mega]=(mbCount[p.mega]||0)+1;});
            const topMB=Object.entries(mbCount).sort((a,b)=>b[1]-a[1])[0];
            return (
              <div style={{...S.panel("fluid"),background:"rgba(10,20,40,0.8)",border:"1px solid rgba(255,200,0,0.2)"}}>
                <span style={S.label("#ffd600")}>· Consensus — Numbers Appearing in 2+ Models ·</span>
                {consensus.length===0
                  ? <div style={{fontSize:"9px",color:"#1e4060",textAlign:"center",padding:"8px 0"}}>No overlapping numbers — models diverge completely</div>
                  : <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center"}}>
                      {consensus.map(({n,c})=>(
                        <div key={n} style={{textAlign:"center"}}>
                          <div style={{width:"44px",height:"44px",borderRadius:"50%",
                            background:"radial-gradient(circle at 35% 35%,#1a1400,#040408)",
                            border:"2px solid #ffd600",boxShadow:"0 0 16px rgba(255,214,0,0.5)",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:"16px",fontWeight:"900",color:"#ffd600",margin:"0 auto"}}>{n}</div>
                          <div style={{fontSize:"7px",color:"#3a2800",marginTop:"2px"}}>{c===3?"★ ALL 3":"2 of 3"}</div>
                        </div>
                      ))}
                      {topMB[1]>=2&&(
                        <div style={{textAlign:"center",marginLeft:"10px",borderLeft:"1px solid rgba(255,214,0,0.2)",paddingLeft:"10px"}}>
                          <div style={{fontSize:"7px",color:"#3a2000",marginBottom:"3px"}}>CONSENSUS MB</div>
                          <div style={{width:"44px",height:"44px",borderRadius:"50%",
                            background:"radial-gradient(circle at 35% 35%,#2a1400,#040408)",
                            border:"2px solid #ffd600",boxShadow:"0 0 16px rgba(255,214,0,0.6)",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:"16px",fontWeight:"900",color:"#ffd600",margin:"0 auto"}}>{topMB[0]}</div>
                          <div style={{fontSize:"7px",color:"#3a2000",marginTop:"2px"}}>{topMB[1]} of 3 models</div>
                        </div>
                      )}
                    </div>
                }
              </div>
            );
          })()}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
            {[
              {mi:0,key:"fluid",   lines:["P = fᵢ/f̄ (pressure)","v = recency (velocity)","Re = ρvL/μ (Reynolds)","F = 0.38v+0.30P+0.18/ω"]},
              {mi:1,key:"smart",   lines:["E = ½k(ago-T)² (spring)","Unpopularity = 1/bias","Balance: sum 100-175","2-3 odd/even, 2-3 low/high"]},
              {mi:2,key:"quantum", lines:["ψ = √(f/N)·e^(iθ) (wave)","P = |ψ|²·interference","P_tunnel = e^(-κ·barrier)","Entanglement pair boost"]},
            ].map(({mi,key,lines})=>{
              const t=THEME[MODEL_THEMES[mi]];
              return (
                <div key={mi} style={{...S.panel(key),fontSize:"8px"}}>
                  <span style={S.label(t.secondary)}>{MODEL_LABELS[mi]} · Core Equations</span>
                  {lines.map(l=><div key={l} style={{color:t.primary,opacity:0.7,marginBottom:"3px",fontStyle:"italic"}}>{l}</div>)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab==="fluid" && (
        <div className="tab-s" style={{position:"relative",zIndex:1}}>
          <ModelDetailView modelIdx={0} scores={fluidBalls} mbScores={fluidMB}
            prediction={predictions[0]} S={S} Ball={Ball}
            selectedBall={selectedBall} setSelectedBall={setSelectedBall}
            title="Navier-Stokes Fluid Dynamics Model"
            desc="Treats each ball's draw history as a fluid flow field. Pressure = frequency weight, Velocity = recency, Reynolds number determines turbulence regime."/>
        </div>
      )}

      {activeTab==="smart" && (
        <div className="tab-s" style={{position:"relative",zIndex:1}}>
          <SmartModelView scores={smartBalls} mbScores={smartMB}
            prediction={predictions[1]} S={S} Ball={Ball}
            selectedBall={selectedBall} setSelectedBall={setSelectedBall}/>
        </div>
      )}

      {activeTab==="quantum" && (
        <div className="tab-s" style={{position:"relative",zIndex:1}}>
          <QuantumModelView scores={quantumBalls} mbScores={quantumMB}
            prediction={predictions[2]} S={S} Ball={Ball}
            selectedBall={selectedBall} setSelectedBall={setSelectedBall}/>
        </div>
      )}

      <div style={{marginTop:"12px",textAlign:"center",fontSize:"7px",color:"#0c1c2e",letterSpacing:"0.2em",position:"relative",zIndex:1}}>
        DATA: LOTTOAMERICA.COM · {TOTAL_DRAWS.toLocaleString()} DRAWS · SEP 1996→APR 2026 · TICK {tick}
      </div>
    </div>
  );
}

function ModelDetailView({modelIdx,scores,mbScores,prediction,S,Ball,selectedBall,setSelectedBall,title,desc}) {
  const t=THEME[MODEL_THEMES[modelIdx]];
  const sorted=[...scores].sort((a,b)=>b.score-a.score);
  const maxS=sorted[0].score;
  const predSet=new Set(prediction.main);
  const detailBall=selectedBall?.modelIdx===modelIdx?scores.find(s=>s.num===selectedBall.num):null;
  return (
    <>
      <div style={{...S.panel(MODEL_THEMES[modelIdx]),textAlign:"center",marginBottom:"10px"}}>
        <span style={S.label(t.primary)}>· {title} ·</span>
        <div style={{fontSize:"8px",color:"#1e4060",marginBottom:"16px",maxWidth:"600px",margin:"0 auto 16px",lineHeight:1.8}}>{desc}</div>
        <div style={{display:"flex",justifyContent:"center",gap:"14px",flexWrap:"wrap",marginBottom:"16px",alignItems:"flex-end"}}>
          {prediction.main.map(n=>{
            const s=scores.find(x=>x.num===n);
            return <Ball key={n} num={n} modelIdx={modelIdx} size={66} showRank rank={sorted.findIndex(x=>x.num===n)+1} freq={s?.freq}/>;
          })}
          <div style={{borderLeft:`1px solid ${t.border}`,paddingLeft:"14px",marginLeft:"4px"}}>
            <div style={{fontSize:"7px",color:"#3a2000",marginBottom:"4px"}}>MEGA BALL</div>
            <Ball num={prediction.mega} modelIdx={modelIdx} isMega size={66} freq={mbScores.find(s=>s.num===prediction.mega)?.freq}/>
          </div>
        </div>
        <div style={{fontSize:"11px",color:t.primary,letterSpacing:"0.15em",fontWeight:"bold"}}>
          {prediction.main.join("  ·  ")} + MB {prediction.mega}
        </div>
      </div>
      <div style={S.panel(MODEL_THEMES[modelIdx])}>
        <span style={S.label(t.secondary)}>· Top 15 by Score ·</span>
        {sorted.slice(0,15).map((s,i)=>(
          <div key={s.num} onClick={()=>setSelectedBall({modelIdx,num:s.num})}
            style={{marginBottom:"5px",display:"flex",alignItems:"center",gap:"7px",cursor:"pointer"}}>
            <div style={{width:"18px",fontSize:"7px",color:"#1e4060",textAlign:"right"}}>#{i+1}</div>
            <div style={{width:"22px",fontSize:"10px",color:predSet.has(s.num)?"#fff":t.primary,fontWeight:"bold",textAlign:"center"}}>{s.num}</div>
            <div style={{flex:1,height:"6px",background:"rgba(0,20,50,0.8)",borderRadius:"3px",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${(s.score/maxS)*100}%`,background:`linear-gradient(90deg,${t.primary}55,${t.primary})`,borderRadius:"3px"}}/>
            </div>
            <div style={{width:"44px",fontSize:"8px",color:"#2a5070",textAlign:"right"}}>{s.score.toFixed(3)}</div>
            <div style={{width:"8px",fontSize:"8px",textAlign:"center",color:"#ffd600"}}>{predSet.has(s.num)?"★":""}</div>
          </div>
        ))}
      </div>
      {detailBall&&(
        <div style={{...S.panel(MODEL_THEMES[modelIdx]),animation:"flowIn 0.25s ease"}}>
          <span style={S.label(t.primary)}>· Ball {detailBall.num} · Full Metrics ·</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:"20px"}}>
            <div style={{textAlign:"center",minWidth:"70px"}}>
              <div style={{fontSize:"32px",fontWeight:"900",color:t.primary}}>{detailBall.num}</div>
              <div style={{fontSize:"7px",color:"#1e4060"}}>{detailBall.freq} draws</div>
              {detailBall.regime&&<div style={{fontSize:"7px",color:detailBall.regime==="turbulent"?"#ff3333":detailBall.regime==="transitional"?"#ff8c00":"#00e676",marginTop:"2px"}}>{detailBall.regime?.toUpperCase()}</div>}
            </div>
            <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px"}}>
              {detailBall.metrics?.map(([k,v])=>(
                <div key={k}><div style={{fontSize:"7px",color:"#1e4060",letterSpacing:"0.15em"}}>{k.toUpperCase()}</div><div style={{fontSize:"12px",color:t.primary}}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SmartModelView({scores,mbScores,prediction,S,Ball,selectedBall,setSelectedBall}) {
  const t=THEME.smart;
  const sorted=[...scores].sort((a,b)=>b.score-a.score);
  const maxS=sorted[0].score;
  const predSet=new Set(prediction.main);
  const detailBall=selectedBall?.modelIdx===1?scores.find(s=>s.num===selectedBall.num):null;
  const comboSum=prediction.main.reduce((a,b)=>a+b,0);
  const comboOdds=prediction.main.filter(n=>n%2!==0).length;
  const comboLows=prediction.main.filter(n=>n<=35).length;
  return (
    <>
      <div style={{...S.panel("smart"),textAlign:"center"}}>
        <span style={S.label(t.primary)}>· Smart Play · Spring + Split Avoidance + Balance ·</span>
        <div style={{display:"flex",justifyContent:"center",gap:"14px",flexWrap:"wrap",marginBottom:"16px",alignItems:"flex-end"}}>
          {prediction.main.map(n=>{const s=scores.find(x=>x.num===n);return(
            <div key={n} style={{textAlign:"center"}}>
              <Ball num={n} modelIdx={1} size={66} showRank rank={sorted.findIndex(x=>x.num===n)+1} freq={s?.freq}/>
              <div style={{fontSize:"7px",marginTop:"3px",color:s?.pop>1.5?"#ff6b35":s?.pop>1.2?"#ffb347":"#00e676"}}>{s?.tag}</div>
            </div>
          );})}
          <div style={{borderLeft:`1px solid ${t.border}`,paddingLeft:"14px",marginLeft:"4px"}}>
            <div style={{fontSize:"7px",color:"#3a2000",marginBottom:"4px"}}>MEGA BALL</div>
            <Ball num={prediction.mega} modelIdx={1} isMega size={66} freq={mbScores.find(s=>s.num===prediction.mega)?.freq}/>
          </div>
        </div>
        <div style={{display:"inline-flex",gap:"12px",background:"rgba(0,30,15,0.6)",border:"1px solid rgba(0,200,100,0.2)",borderRadius:"8px",padding:"8px 16px",flexWrap:"wrap",justifyContent:"center",marginBottom:"10px"}}>
          {[[`Sum: ${comboSum}`,comboSum>=100&&comboSum<=175,"100-175"],[`Odd/Even: ${comboOdds}/${5-comboOdds}`,comboOdds>=2&&comboOdds<=3,"2-3 odd"],[`Low/High: ${comboLows}/${5-comboLows}`,comboLows>=2&&comboLows<=3,"2-3 low"]].map(([label,pass,rule])=>(
            <div key={label} style={{textAlign:"center"}}>
              <div style={{fontSize:"9px",color:pass?"#00e676":"#ff6b35",fontWeight:"bold"}}>{label}</div>
              <div style={{fontSize:"6px",color:"#1e4060"}}>{pass?"✓":rule}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:"11px",color:t.primary,letterSpacing:"0.15em",fontWeight:"bold"}}>{prediction.main.join("  ·  ")} + MB {prediction.mega}</div>
      </div>
      <div style={S.panel("smart")}>
        <span style={S.label(t.secondary)}>· Popularity Bias · Red = Overplayed ·</span>
        <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:"3px",marginBottom:"8px"}}>
          {scores.map(s=>{
            const isP=predSet.has(s.num);
            const bg=s.pop>1.8?"rgba(80,10,0,0.7)":s.pop>1.4?"rgba(60,20,0,0.7)":s.pop>1.1?"rgba(20,40,0,0.7)":"rgba(0,40,20,0.7)";
            const bc=s.pop>1.8?"#ff3333":s.pop>1.4?"#ff8c00":s.pop>1.1?"#ffb347":"#00e676";
            return (
              <div key={s.num} onClick={()=>setSelectedBall({modelIdx:1,num:s.num})}
                style={{background:bg,border:`1px solid ${isP?"#fff":bc}44`,borderRadius:"4px",padding:"4px 1px",textAlign:"center",cursor:"pointer",position:"relative"}}>
                <div style={{fontSize:"clamp(8px,1.2vw,11px)",color:isP?"#fff":bc,fontWeight:isP?"bold":"normal"}}>{s.num}</div>
                <div style={{fontSize:"6px",color:"#1e4060",marginTop:"1px"}}>{s.pop.toFixed(1)}×</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={S.panel("smart")}>
        <span style={S.label(t.secondary)}>· Top 15 by Smart Score ·</span>
        {sorted.slice(0,15).map((s,i)=>(
          <div key={s.num} onClick={()=>setSelectedBall({modelIdx:1,num:s.num})}
            style={{marginBottom:"5px",display:"flex",alignItems:"center",gap:"6px",cursor:"pointer"}}>
            <div style={{width:"16px",fontSize:"7px",color:"#1e4060",textAlign:"right"}}>#{i+1}</div>
            <div style={{width:"22px",fontSize:"10px",fontWeight:"bold",textAlign:"center",color:predSet.has(s.num)?"#fff":t.primary}}>{s.num}</div>
            <div style={{flex:1,height:"6px",background:"rgba(0,20,10,0.8)",borderRadius:"3px",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${(s.score/maxS)*100}%`,background:`linear-gradient(90deg,${t.primary}55,${t.primary})`,borderRadius:"3px"}}/>
            </div>
            <div style={{width:"44px",fontSize:"8px",color:"#2a5070",textAlign:"right"}}>{s.score.toFixed(3)}</div>
            <div style={{width:"8px",fontSize:"8px",color:"#ffd600"}}>{predSet.has(s.num)?"★":""}</div>
          </div>
        ))}
      </div>
      {detailBall&&(
        <div style={{...S.panel("smart"),animation:"flowIn 0.25s ease"}}>
          <span style={S.label(t.primary)}>· Ball {detailBall.num} · Smart Metrics ·</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:"20px"}}>
            <div style={{textAlign:"center",minWidth:"70px"}}>
              <div style={{fontSize:"32px",fontWeight:"900",color:t.primary}}>{detailBall.num}</div>
              <div style={{fontSize:"7px",color:"#1e4060"}}>{detailBall.freq} draws</div>
              <div style={{fontSize:"7px",marginTop:"2px",color:detailBall.pop>1.5?"#ff6b35":detailBall.pop>1.2?"#ffb347":"#00e676"}}>{detailBall.tag}</div>
            </div>
            <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px"}}>
              {detailBall.metrics?.map(([k,v])=>(
                <div key={k}><div style={{fontSize:"7px",color:"#1e4060",letterSpacing:"0.12em"}}>{k.toUpperCase()}</div><div style={{fontSize:"12px",color:t.primary}}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QuantumModelView({scores,mbScores,prediction,S,Ball,selectedBall,setSelectedBall}) {
  const t=THEME.quantum;
  const sorted=[...scores].sort((a,b)=>b.score-a.score);
  const maxS=sorted[0].score;
  const predSet=new Set(prediction.main);
  const detailBall=selectedBall?.modelIdx===2?scores.find(s=>s.num===selectedBall.num):null;
  const stateColor=(state)=>state==="RESONANT"?"#e040fb":state==="COLLAPSED"?"#ff3333":state==="DESTRUCTIVE"?"#448aff":"#a78bfa";
  return (
    <>
      <div style={{...S.panel("quantum"),textAlign:"center"}}>
        <span style={S.label(t.primary)}>· Quantum Entanglement Model · For Science & Fun ·</span>
        <div style={{fontSize:"8px",color:"#2a1040",marginBottom:"16px",lineHeight:2.0,maxWidth:"640px",margin:"0 auto 16px",fontStyle:"italic"}}>
          <span style={{color:"#e040fb"}}>ψ(n) = √(f/N) · e^(iθ)</span>{" where θ = 2π·ago/T · "}
          <span style={{color:"#a78bfa"}}>P(n) = |ψ|² · interference + tunneling + entanglement</span>
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:"14px",flexWrap:"wrap",marginBottom:"16px",alignItems:"flex-end"}}>
          {prediction.main.map(n=>{const s=scores.find(x=>x.num===n);return(
            <div key={n} style={{textAlign:"center"}}>
              <Ball num={n} modelIdx={2} size={66} showRank rank={sorted.findIndex(x=>x.num===n)+1} freq={s?.freq}/>
              <div style={{fontSize:"7px",color:stateColor(s?.state),marginTop:"3px"}}>{s?.state}</div>
            </div>
          );})}
          <div style={{borderLeft:`1px solid ${t.border}`,paddingLeft:"14px",marginLeft:"4px"}}>
            <div style={{fontSize:"7px",color:"#3a2000",marginBottom:"4px"}}>MEGA BALL</div>
            <Ball num={prediction.mega} modelIdx={2} isMega size={66} freq={mbScores.find(s=>s.num===prediction.mega)?.freq}/>
          </div>
        </div>
        <div style={{fontSize:"11px",color:t.primary,letterSpacing:"0.15em",fontWeight:"bold"}}>{prediction.main.join("  ·  ")} + MB {prediction.mega}</div>
      </div>
      <div style={S.panel("quantum")}>
        <span style={S.label(t.secondary)}>· Quantum State Field ·</span>
        <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:"3px",marginBottom:"8px"}}>
          {scores.map(s=>{
            const isP=predSet.has(s.num), sc=stateColor(s.state), alpha=Math.min(s.score/maxS*1.4,1);
            return (
              <div key={s.num} onClick={()=>setSelectedBall({modelIdx:2,num:s.num})}
                style={{background:`rgba(30,0,50,${alpha*0.6})`,border:`1px solid ${isP?"#fff":sc}44`,borderRadius:"4px",padding:"4px 1px",textAlign:"center",cursor:"pointer",position:"relative"}}>
                <div style={{fontSize:"clamp(8px,1.2vw,11px)",color:isP?"#fff":sc,fontWeight:isP?"bold":"normal"}}>{s.num}</div>
                <div style={{fontSize:"6px",color:"#2a1040",marginTop:"1px"}}>{s.state==="RESONANT"?"~":s.state==="COLLAPSED"?"×":s.state==="DESTRUCTIVE"?"↓":"○"}</div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:"12px",flexWrap:"wrap",justifyContent:"center"}}>
          {[["#e040fb","RESONANT"],["#ff3333","COLLAPSED"],["#448aff","DESTRUCTIVE"],["#a78bfa","SUPERPOSED"]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:"3px"}}>
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:c}}/>
              <span style={{fontSize:"7px",color:"#3a2070"}}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={S.panel("quantum")}>
        <span style={S.label(t.secondary)}>· Quantum Entangled Pairs ·</span>
        <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
          {ENTANGLED_PAIRS.map(([a,b])=>(
            <div key={`${a}-${b}`} style={{display:"flex",alignItems:"center",gap:"4px",background:"rgba(30,0,60,0.6)",border:"1px solid rgba(200,50,255,0.2)",borderRadius:"20px",padding:"4px 10px"}}>
              <span style={{fontSize:"11px",fontWeight:"bold",color:t.primary}}>{a}</span>
              <span style={{fontSize:"8px",color:"#3a1060"}}>⟷</span>
              <span style={{fontSize:"11px",fontWeight:"bold",color:t.primary}}>{b}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={S.panel("quantum")}>
        <span style={S.label(t.secondary)}>· Top 15 by Quantum Score ·</span>
        {sorted.slice(0,15).map((s,i)=>{
          const sc=stateColor(s.state);
          return (
            <div key={s.num} onClick={()=>setSelectedBall({modelIdx:2,num:s.num})}
              style={{marginBottom:"5px",display:"flex",alignItems:"center",gap:"6px",cursor:"pointer"}}>
              <div style={{width:"16px",fontSize:"7px",color:"#1e1040",textAlign:"right"}}>#{i+1}</div>
              <div style={{width:"22px",fontSize:"10px",fontWeight:"bold",textAlign:"center",color:predSet.has(s.num)?"#fff":t.primary}}>{s.num}</div>
              <div style={{flex:1,height:"6px",background:"rgba(20,0,40,0.8)",borderRadius:"3px",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(s.score/maxS)*100}%`,background:`linear-gradient(90deg,${t.primary}55,${t.primary})`,borderRadius:"3px"}}/>
              </div>
              <div style={{width:"60px",fontSize:"7px",color:sc,textAlign:"right"}}>{s.state}</div>
              <div style={{width:"44px",fontSize:"8px",color:"#3a2070",textAlign:"right"}}>{s.score.toFixed(3)}</div>
              <div style={{width:"8px",fontSize:"8px",color:"#ffd600"}}>{predSet.has(s.num)?"★":""}</div>
            </div>
          );
        })}
      </div>
      {detailBall&&(
        <div style={{...S.panel("quantum"),animation:"flowIn 0.25s ease"}}>
          <span style={S.label(t.primary)}>· Ball {detailBall.num} · Quantum Metrics ·</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:"20px"}}>
            <div style={{textAlign:"center",minWidth:"70px"}}>
              <div style={{fontSize:"32px",fontWeight:"900",color:t.primary}}>{detailBall.num}</div>
              <div style={{fontSize:"7px",color:"#1e1040"}}>{detailBall.freq} draws</div>
              <div style={{fontSize:"7px",color:stateColor(detailBall.state),marginTop:"3px"}}>{detailBall.state}</div>
              {detailBall.entanglement>0&&<div style={{fontSize:"7px",color:t.primary,marginTop:"2px"}}>⟷ ENTANGLED</div>}
            </div>
            <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px"}}>
              {detailBall.metrics?.map(([k,v])=>(
                <div key={k}><div style={{fontSize:"7px",color:"#1e1040",letterSpacing:"0.12em"}}>{k.toUpperCase()}</div><div style={{fontSize:"12px",color:t.primary}}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
