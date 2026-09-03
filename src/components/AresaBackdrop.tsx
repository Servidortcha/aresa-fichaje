const COLORS = ["#14C3B0", "#2E6F9E", "#163A5F", "#2E6F9E"];
function BarGroup({ heights, corner }: { heights:number[], corner:'left'|'right' }) {
  const pos: React.CSSProperties = corner === "right"
    ? { right: "-3vw", bottom: "-3vw" }
    : { left: "-3vw", top: "-3vw", flexDirection: "column-reverse" as any };
  return (
    <div className="absolute pointer-events-none select-none" style={{ ...pos, display: "flex", alignItems: corner==="right"?"flex-end":"flex-start", gap:"14px", opacity:0.16 }}>
      {heights.map((h, idx) => <div key={idx} style={{ width:"30px", height:`${h}px`, background: COLORS[idx % COLORS.length] }} />)}
    </div>
  );
}
export default function AresaBackdrop() {
  return (
    <>
      <BarGroup heights={[80,160,110,200,130,180]} corner="right" />
      <BarGroup heights={[140,90,170,110]} corner="left" />
    </>
  );
}
