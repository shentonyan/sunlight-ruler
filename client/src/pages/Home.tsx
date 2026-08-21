/**
 * 日光尺 · 晨昏仪视觉系统
 * 设计提醒：时间是一眼可读的主角；使用连续的日光轨迹、暖白留白、墨蓝夜色与琥珀日线。
 * 不把页面做成数据密集型天气面板；所有交互保持如校准一件精密仪器般克制、直接。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as SunCalc from "suncalc";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Download,
  LocateFixed,
  MapPin,
  Minus,
  MoonStar,
  Navigation,
  Share2,
  Sparkles,
  Sunrise,
  Sunset,
  X,
} from "lucide-react";

type City = { id: string; name: string; country: string; zone: string; sunrise: number; sunset: number };
type Coordinates = { latitude: number; longitude: number; accuracy: number };
type LocationStatus = "idle" | "requesting" | "active" | "error";

const cities: City[] = [
  { id: "shanghai", name: "上海", country: "中国", zone: "Asia/Shanghai", sunrise: 323, sunset: 1107 },
  { id: "beijing", name: "北京", country: "中国", zone: "Asia/Shanghai", sunrise: 324, sunset: 1114 },
  { id: "marrakesh", name: "马拉喀什", country: "摩洛哥", zone: "Africa/Casablanca", sunrise: 420, sunset: 1211 },
  { id: "paris", name: "巴黎", country: "法国", zone: "Europe/Paris", sunrise: 428, sunset: 1240 },
  { id: "new-york", name: "纽约", country: "美国", zone: "America/New_York", sunrise: 378, sunset: 1174 },
];

const imageAssets = {
  mark: "/manus-storage/sunlight-ruler-mark_56cdcc2d.png",
  hero: "/manus-storage/sunlight-ruler-hero-atmosphere_ceaa49c6.jpg",
  dawn: "/manus-storage/sunlight-ruler-dawn-card_b0568b5a.jpg",
  dusk: "/manus-storage/sunlight-ruler-dusk-card_4c1ef617.jpg",
};

function cityDateParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (kind: string) => Number(parts.find((part) => part.type === kind)?.value ?? 0);
  return { hour: value("hour"), minute: value("minute"), second: value("second") };
}

function cityDateLabel(date: Date, zone: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: zone, weekday: "long", month: "long", day: "numeric" }).format(date);
}

function minutesFromDate(date: Date) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function formatMinutes(minutes: number) {
  const normalised = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalised / 60)).padStart(2, "0")}:${String(normalised % 60).padStart(2, "0")}`;
}

function formatRemaining(minutes: number) {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours === 0) return `${mins} 分钟`;
  return `${hours} 小时${mins ? ` ${mins} 分钟` : ""}`;
}

function SunArc({ progress, night }: { progress: number; night: boolean }) {
  const clamped = Math.min(1, Math.max(0, progress));
  const p = night ? 1 : clamped;
  const x = (1 - p) * (1 - p) * 30 + 2 * (1 - p) * p * 250 + p * p * 470;
  const y = (1 - p) * (1 - p) * 254 + 2 * (1 - p) * p * 20 + p * p * 254;
  return (
    <svg className="sun-arc" viewBox="0 0 500 292" role="img" aria-label="当天的日光轨迹">
      <path className="arc-guide" d="M30 254 Q250 20 470 254" pathLength="100" />
      <path className="arc-active" d="M30 254 Q250 20 470 254" pathLength="100" style={{ strokeDasharray: `${Math.max(2, clamped * 100)} 100` }} />
      <line className="horizon" x1="16" x2="484" y1="254" y2="254" />
      <line className="tick" x1="30" x2="30" y1="246" y2="264" />
      <line className="tick" x1="250" x2="250" y1="247" y2="261" />
      <line className="tick" x1="470" x2="470" y1="246" y2="264" />
      <circle className={night ? "sun-dot is-night" : "sun-dot"} cx={x} cy={y} r="9" />
      <circle className="sun-halo" cx={x} cy={y} r="18" />
    </svg>
  );
}

function WidgetPreview({ name, sunrise, timeText, remaining, night }: { name: string; sunrise: number; timeText: string; remaining: string; night: boolean }) {
  return (
    <section className="widget-stack" aria-label="小组件预览">
      <div className="widget-heading"><span>组件样张</span><span className="widget-spec">SMALL / LOCK</span></div>
      <article className={night ? "home-widget widget-night" : "home-widget"}>
        <div className="widget-topline"><span>日光尺</span><span>{name}</span></div>
        <div className="widget-time">{timeText.slice(0, 5)}</div>
        <div className="widget-line"><span className="widget-sun" /><span className="widget-rule" /></div>
        <div className="widget-copy">{night ? "明天见" : `日光还剩 ${remaining}`}</div>
      </article>
      <article className="lock-widget">
        <div className="lock-icon"><Sunrise size={17} strokeWidth={1.8} /></div>
        <div><div className="lock-label">下一次日出</div><div className="lock-value">{formatMinutes(sunrise)} <span>· {name}</span></div></div>
        <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </article>
    </section>
  );
}

export default function Home() {
  const [now, setNow] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState("shanghai");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationError, setLocationError] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const city = cities.find((item) => item.id === selectedId) ?? cities[0];
  const usingLiveLocation = Boolean(coordinates && locationStatus === "active");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const details = useMemo(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const zone = usingLiveLocation ? browserZone : city.zone;
    let sunrise = city.sunrise;
    let sunset = city.sunset;
    if (coordinates) {
      const times = SunCalc.getTimes(now, coordinates.latitude, coordinates.longitude);
      const possibleSunrise = times.sunrise;
      const possibleSunset = times.sunset;
      if (possibleSunrise && possibleSunset && !Number.isNaN(possibleSunrise.getTime()) && !Number.isNaN(possibleSunset.getTime())) {
        sunrise = minutesFromDate(possibleSunrise);
        sunset = minutesFromDate(possibleSunset);
      }
    }
    const current = cityDateParts(now, zone);
    const currentMinutes = current.hour * 60 + current.minute + current.second / 60;
    const daylightProgress = (currentMinutes - sunrise) / (sunset - sunrise);
    const beforeSunrise = currentMinutes < sunrise;
    const afterSunset = currentMinutes >= sunset;
    const night = beforeSunrise || afterSunset;
    const remaining = sunset - currentMinutes;
    const timeText = `${String(current.hour).padStart(2, "0")}:${String(current.minute).padStart(2, "0")}:${String(current.second).padStart(2, "0")}`;
    const status = beforeSunrise ? `日出还有 ${formatRemaining(sunrise - currentMinutes)}` : afterSunset ? `明天 ${formatMinutes(sunrise)} 见` : `黄昏还有 ${formatRemaining(remaining)}`;
    const locationName = usingLiveLocation ? "当前位置" : city.name;
    const locationSubline = usingLiveLocation && coordinates ? `${coordinates.latitude.toFixed(3)}°, ${coordinates.longitude.toFixed(3)}°` : city.country;
    return { sunrise, sunset, daylightProgress, night, remaining, timeText, status, zone, locationName, locationSubline, dateLabel: cityDateLabel(now, zone) };
  }, [city, coordinates, now, usingLiveLocation]);

  useEffect(() => {
    const canvas = cardCanvasRef.current;
    if (!canvas || !cardOpen) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const W = 1080; const H = 1350;
    canvas.width = W; canvas.height = H;
    context.fillStyle = "#f5f3ed"; context.fillRect(0, 0, W, H);
    const wash = context.createLinearGradient(0, 0, W, H);
    wash.addColorStop(0, "#fffdf7"); wash.addColorStop(0.58, "#f6e9cc"); wash.addColorStop(1, "#dae1f1");
    context.fillStyle = wash; context.fillRect(0, 0, W, H);
    context.globalAlpha = 0.23;
    for (let x = -300; x < W + 450; x += 150) { context.fillStyle = "#ffffff"; context.beginPath(); context.moveTo(x, 0); context.lineTo(x + 210, 0); context.lineTo(x - 250, H); context.lineTo(x - 460, H); context.closePath(); context.fill(); }
    context.globalAlpha = 1;
    context.strokeStyle = "#17202b"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(108, 1050); context.quadraticCurveTo(540, 530, 972, 1050); context.stroke();
    context.strokeStyle = "#f5a623"; context.lineWidth = 5; context.lineCap = "round";
    const progress = Math.min(1, Math.max(0, details.daylightProgress));
    context.beginPath(); context.moveTo(108, 1050); context.quadraticCurveTo(540 * progress, 1050 - 520 * progress, 108 + 864 * progress, 1050); context.stroke();
    const p = details.night ? 1 : progress;
    const px = (1 - p) * (1 - p) * 108 + 2 * (1 - p) * p * 540 + p * p * 972;
    const py = (1 - p) * (1 - p) * 1050 + 2 * (1 - p) * p * 530 + p * p * 1050;
    context.fillStyle = "#f5a623"; context.beginPath(); context.arc(px, py, 19, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "rgba(23,32,43,.22)"; context.lineWidth = 1; context.beginPath(); context.moveTo(80, 1118); context.lineTo(1000, 1118); context.stroke();
    context.fillStyle = "#17202b"; context.font = "600 34px -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"; context.fillText("日光尺  /  SUNLIGHT RULER", 80, 110);
    context.font = "560 190px ui-rounded, 'SF Pro Rounded', -apple-system, sans-serif"; context.fillText(details.timeText.slice(0, 5), 72, 430);
    context.fillStyle = "#64707a"; context.font = "500 30px -apple-system, BlinkMacSystemFont, sans-serif"; context.fillText(`${details.dateLabel}  ·  ${details.locationName}`, 80, 490);
    context.fillStyle = "#17202b"; context.font = "600 58px -apple-system, BlinkMacSystemFont, sans-serif"; context.fillText(details.status, 80, 620);
    context.fillStyle = "#64707a"; context.font = "500 28px -apple-system, BlinkMacSystemFont, sans-serif"; context.fillText(`日出 ${formatMinutes(details.sunrise)}    日落 ${formatMinutes(details.sunset)}    日照 ${formatRemaining(details.sunset - details.sunrise)}`, 80, 1200);
    context.font = "500 25px -apple-system, BlinkMacSystemFont, sans-serif"; context.fillText(usingLiveLocation ? "仅在本机使用当前位置计算" : "以选定地点的今日光线为标尺", 80, 1262);
  }, [cardOpen, details, usingLiveLocation]);

  const requestLocation = () => {
    if (!navigator.geolocation) { setLocationStatus("error"); setLocationError("当前浏览器不支持定位服务。"); return; }
    setLocationStatus("requesting"); setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => { setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }); setLocationStatus("active"); setPickerOpen(false); },
      (error) => { setLocationStatus("error"); setLocationError(error.code === error.PERMISSION_DENIED ? "你可以继续使用预设城市；定位权限未被授予。" : "暂时无法读取位置，请稍后重试。"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  const saveCard = async (mode: "download" | "share") => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) { setExportMessage("卡片生成失败，请再试一次。"); return; }
    const filename = `日光尺-${new Date().toISOString().slice(0, 10)}.png`;
    const download = () => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); setExportMessage("日光卡已下载到本机。"); };
    if (mode === "share") {
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        try { await navigator.share({ title: "日光尺", text: `${details.status}。`, files: [file] }); setExportMessage("已打开系统分享面板。"); } catch { setExportMessage("已取消分享；你也可以下载图片。 "); }
      } else { download(); }
      return;
    }
    download();
  };

  return (
    <main className={`sundial-page${details.night ? " is-night" : ""}`}>
      <div className="page-grain" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#观测台" aria-label="日光尺首页"><span className="brand-sigil" aria-hidden="true"><img src={imageAssets.mark} alt="" /><i /></span><span className="brand-name">日光尺</span><span className="brand-divider" /><span className="brand-subtitle">SUNLIGHT RULER</span></a>
        <div className="topbar-actions"><button className="card-open" onClick={() => { setExportMessage(""); setCardOpen(true); }}><Sparkles size={14} />制备日光卡</button><div className="topbar-meta"><span className="live-dot" /><span>{usingLiveLocation ? "真实坐标" : "今日观测"}</span><span className="meta-rule" /><span>08·21</span></div></div>
      </header>

      <section className="observer-layout" id="观测台">
        <section className="time-panel" aria-labelledby="time-heading">
          <div className="hero-image" style={{ backgroundImage: `url(${imageAssets.hero})` }} aria-hidden="true" />
          <div className="time-content"><div className="eyebrow"><Clock3 size={14} /> 此刻 / {details.locationName.toUpperCase()}</div><h1 id="time-heading" className="hero-time">{details.timeText}</h1><p className="date-line">{details.dateLabel}</p><div className="time-status"><span className="status-mark" /><span>{details.status}</span></div></div>
          <div className="hero-corner-note"><span>光线角度</span><strong>{details.night ? "—" : `${Math.round(Math.max(0, details.daylightProgress) * 63)}°`}</strong></div>
        </section>

        <section className="arc-panel" aria-label="日光观测结果">
          <div className="panel-topline"><span>{usingLiveLocation ? "真实坐标 / 今日" : "自然光 / 今日"}</span><span>{details.night ? "夜间" : `${Math.round(Math.min(1, Math.max(0, details.daylightProgress)) * 100)}%`}</span></div>
          <div className="arc-canvas"><SunArc progress={details.daylightProgress} night={details.night} /><div className="arc-reading"><span>日照已过</span><strong>{Math.max(0, Math.min(100, Math.round(details.daylightProgress * 100)))}%</strong></div></div>
          <div className="sun-times"><div className="sun-time"><Sunrise size={18} strokeWidth={1.7} /><div><span>日出</span><strong>{formatMinutes(details.sunrise)}</strong></div></div><div className="sun-time mid"><Minus size={18} strokeWidth={1.3} /><div><span>日照</span><strong>{formatRemaining(details.sunset - details.sunrise)}</strong></div></div><div className="sun-time align-right"><Sunset size={18} strokeWidth={1.7} /><div><span>日落</span><strong>{formatMinutes(details.sunset)}</strong></div></div></div>
        </section>

        <aside className="side-panel">
          <div className="place-control"><span className="side-label">校准地点</span><button className="place-button" onClick={() => setPickerOpen((open) => !open)} aria-expanded={pickerOpen}><span className="pin-wrap"><MapPin size={16} strokeWidth={1.8} /></span><span className="place-text"><strong>{details.locationName}</strong><small>{details.locationSubline}</small></span><ChevronDown className={pickerOpen ? "chevron is-open" : "chevron"} size={17} /></button>
            {pickerOpen && <div className="city-menu" role="menu" aria-label="选择观测位置"><button className={usingLiveLocation ? "geo-option selected" : "geo-option"} onClick={requestLocation} disabled={locationStatus === "requesting"}><span className="geo-icon"><Navigation size={15} /></span><span><strong>{locationStatus === "requesting" ? "正在校准位置…" : "校准到我的位置"}</strong><small>仅在本机计算日出与日落</small></span>{usingLiveLocation && <Check size={16} strokeWidth={2} />}</button>{cities.map((item) => <button key={item.id} role="menuitem" className={!usingLiveLocation && item.id === city.id ? "city-option selected" : "city-option"} onClick={() => { setSelectedId(item.id); setCoordinates(null); setLocationStatus("idle"); setPickerOpen(false); }}><span><strong>{item.name}</strong><small>{item.country}</small></span>{!usingLiveLocation && item.id === city.id && <Check size={16} strokeWidth={2} />}</button>)}</div>}
          </div>
          <button className={usingLiveLocation ? "locate-button is-active" : "locate-button"} onClick={requestLocation} disabled={locationStatus === "requesting"}><LocateFixed size={16} />{locationStatus === "requesting" ? "正在获取当前位置…" : usingLiveLocation ? "已按真实坐标校准" : "校准到我的位置"}</button>
          {locationError && <p className="location-error">{locationError}</p>}
          <div className="site-note"><MoonStar size={16} strokeWidth={1.6} /><p>{usingLiveLocation ? "坐标只在本机使用，\n不会被上传。" : "一天不止有时间，\n还有光线的刻度。"}</p></div>
          <WidgetPreview name={details.locationName} sunrise={details.sunrise} timeText={details.timeText} remaining={formatRemaining(details.remaining)} night={details.night} />
        </aside>
      </section>

      <footer className="calibration-footer"><span>{usingLiveLocation ? "以真实坐标的日出与日落为标尺" : "以当地日出与日落为标尺"}</span><span className="footer-rule" /><span>页面每秒校准</span><span className="footer-status"><i /> 已同步</span></footer>

      {cardOpen && <div className="card-modal" role="dialog" aria-modal="true" aria-labelledby="card-title"><button className="modal-scrim" aria-label="关闭日光卡" onClick={() => setCardOpen(false)} /><section className="card-sheet"><button className="modal-close" aria-label="关闭" onClick={() => setCardOpen(false)}><X size={18} /></button><div className="card-sheet-copy"><span className="modal-eyebrow"><Sparkles size={14} /> 日光卡</span><h2 id="card-title">把此刻的光线<br />留给自己。</h2><p>{details.status}<br />以 {details.locationName} 的自然光为标尺。</p><div className="card-actions"><button className="export-primary" onClick={() => saveCard("download")}><Download size={16} />下载 PNG</button><button className="export-secondary" onClick={() => saveCard("share")}><Share2 size={16} />系统分享</button></div>{exportMessage && <p className="export-message">{exportMessage}</p>}</div><div className="canvas-wrap"><canvas ref={cardCanvasRef} className="export-canvas" aria-label="日光卡片预览" /></div></section></div>}
    </main>
  );
}
