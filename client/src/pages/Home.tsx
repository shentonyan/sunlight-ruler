/**
 * 日光尺 · 晨昏仪视觉系统
 * 设计提醒：时间是一眼可读的主角；使用连续的日光轨迹、暖白留白、墨蓝夜色与琥珀日线。
 * 不把页面做成数据密集型天气面板；所有交互保持如校准一件精密仪器般克制、直接。
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Minus,
  MoonStar,
  Sunrise,
  Sunset,
} from "lucide-react";

type City = {
  id: string;
  name: string;
  country: string;
  zone: string;
  sunrise: number;
  sunset: number;
};

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
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (kind: string) => Number(parts.find((part) => part.type === kind)?.value ?? 0);
  return { hour: value("hour"), minute: value("minute"), second: value("second") };
}

function cityDateLabel(date: Date, zone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
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

function WidgetPreview({ city, timeText, remaining, night }: { city: City; timeText: string; remaining: string; night: boolean }) {
  return (
    <section className="widget-stack" aria-label="小组件预览">
      <div className="widget-heading">
        <span>组件样张</span>
        <span className="widget-spec">SMALL / LOCK</span>
      </div>
      <article className="home-widget" style={{ backgroundImage: `url(${night ? imageAssets.dusk : imageAssets.dawn})` }}>
        <div className="widget-topline">
          <span>日光尺</span>
          <span>{city.name}</span>
        </div>
        <div className="widget-time">{timeText.slice(0, 5)}</div>
        <div className="widget-line">
          <span className="widget-sun" />
          <span className="widget-rule" />
        </div>
        <div className="widget-copy">{night ? "明天见" : `日光还剩 ${remaining}`}</div>
      </article>
      <article className="lock-widget">
        <div className="lock-icon"><Sunrise size={17} strokeWidth={1.8} /></div>
        <div>
          <div className="lock-label">下一次日出</div>
          <div className="lock-value">{formatMinutes(city.sunrise)} <span>· {city.name}</span></div>
        </div>
        <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </article>
    </section>
  );
}

export default function Home() {
  const [now, setNow] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState("shanghai");
  const [pickerOpen, setPickerOpen] = useState(false);
  const city = cities.find((item) => item.id === selectedId) ?? cities[0];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const details = useMemo(() => {
    const current = cityDateParts(now, city.zone);
    const currentMinutes = current.hour * 60 + current.minute + current.second / 60;
    const daylightProgress = (currentMinutes - city.sunrise) / (city.sunset - city.sunrise);
    const beforeSunrise = currentMinutes < city.sunrise;
    const afterSunset = currentMinutes >= city.sunset;
    const night = beforeSunrise || afterSunset;
    const remaining = city.sunset - currentMinutes;
    const timeText = `${String(current.hour).padStart(2, "0")}:${String(current.minute).padStart(2, "0")}:${String(current.second).padStart(2, "0")}`;
    const status = beforeSunrise
      ? `日出还有 ${formatRemaining(city.sunrise - currentMinutes)}`
      : afterSunset
        ? `明天 ${formatMinutes(city.sunrise)} 见`
        : `黄昏还有 ${formatRemaining(remaining)}`;
    return { currentMinutes, daylightProgress, night, remaining, timeText, status };
  }, [city, now]);

  return (
    <main className={`sundial-page${details.night ? " is-night" : ""}`}>
      <div className="page-grain" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#观测台" aria-label="日光尺首页">
          <span className="brand-sigil" aria-hidden="true"><img src={imageAssets.mark} alt="" /><i /></span>
          <span className="brand-name">日光尺</span>
          <span className="brand-divider" />
          <span className="brand-subtitle">SUNLIGHT RULER</span>
        </a>
        <div className="topbar-meta">
          <span className="live-dot" />
          <span>今日观测</span>
          <span className="meta-rule" />
          <span>08·21</span>
        </div>
      </header>

      <section className="observer-layout" id="观测台">
        <section className="time-panel" aria-labelledby="time-heading">
          <div className="hero-image" style={{ backgroundImage: `url(${imageAssets.hero})` }} aria-hidden="true" />
          <div className="time-content">
            <div className="eyebrow"><Clock3 size={14} /> 此刻 / {city.name.toUpperCase()}</div>
            <h1 id="time-heading" className="hero-time">{details.timeText}</h1>
            <p className="date-line">{cityDateLabel(now, city.zone)}</p>
            <div className="time-status">
              <span className="status-mark" />
              <span>{details.status}</span>
            </div>
          </div>
          <div className="hero-corner-note">
            <span>光线角度</span>
            <strong>{details.night ? "—" : `${Math.round(Math.max(0, details.daylightProgress) * 63)}°`}</strong>
          </div>
        </section>

        <section className="arc-panel" aria-label="日光观测结果">
          <div className="panel-topline">
            <span>自然光 / 今日</span>
            <span>{details.night ? "夜间" : `${Math.round(Math.min(1, Math.max(0, details.daylightProgress)) * 100)}%`}</span>
          </div>
          <div className="arc-canvas">
            <SunArc progress={details.daylightProgress} night={details.night} />
            <div className="arc-reading"><span>日照已过</span><strong>{Math.max(0, Math.min(100, Math.round(details.daylightProgress * 100)))}%</strong></div>
          </div>
          <div className="sun-times">
            <div className="sun-time">
              <Sunrise size={18} strokeWidth={1.7} />
              <div><span>日出</span><strong>{formatMinutes(city.sunrise)}</strong></div>
            </div>
            <div className="sun-time mid"><Minus size={18} strokeWidth={1.3} /><div><span>日照</span><strong>{formatRemaining(city.sunset - city.sunrise)}</strong></div></div>
            <div className="sun-time align-right">
              <Sunset size={18} strokeWidth={1.7} />
              <div><span>日落</span><strong>{formatMinutes(city.sunset)}</strong></div>
            </div>
          </div>
        </section>

        <aside className="side-panel">
          <div className="place-control">
            <span className="side-label">校准地点</span>
            <button className="place-button" onClick={() => setPickerOpen((open) => !open)} aria-expanded={pickerOpen}>
              <span className="pin-wrap"><MapPin size={16} strokeWidth={1.8} /></span>
              <span className="place-text"><strong>{city.name}</strong><small>{city.country}</small></span>
              <ChevronDown className={pickerOpen ? "chevron is-open" : "chevron"} size={17} />
            </button>
            {pickerOpen && (
              <div className="city-menu" role="menu" aria-label="选择观测城市">
                {cities.map((item) => (
                  <button key={item.id} role="menuitem" className={item.id === city.id ? "city-option selected" : "city-option"} onClick={() => { setSelectedId(item.id); setPickerOpen(false); }}>
                    <span><strong>{item.name}</strong><small>{item.country}</small></span>
                    {item.id === city.id && <Check size={16} strokeWidth={2} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="site-note">
            <MoonStar size={16} strokeWidth={1.6} />
            <p>一天不止有时间，<br />还有光线的刻度。</p>
          </div>
          <WidgetPreview city={city} timeText={details.timeText} remaining={formatRemaining(details.remaining)} night={details.night} />
        </aside>
      </section>

      <footer className="calibration-footer">
        <span>以当地日出与日落为标尺</span>
        <span className="footer-rule" />
        <span>页面每秒校准</span>
        <span className="footer-status"><i /> 已同步</span>
      </footer>
    </main>
  );
}
