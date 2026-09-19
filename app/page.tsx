'use client';

import { useEffect, useRef, useState, useCallback, type MouseEvent } from 'react';
import {
  createChart,
  CandlestickSeries,
  ColorType,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  MousePointer2,
  TrendingUp,
  Trash2,
  GripVertical,
  Minus,
  Lock,
  Unlock,
  MoreHorizontal,
} from 'lucide-react';

const PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'TRXUSDT', 'TONUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'LTCUSDT', 'BCHUSDT', 'NEARUSDT', 'ATOMUSDT', 'UNIUSDT', 'ETCUSDT',
  'APTUSDT', 'ARBUSDT', 'OPUSDT', 'FILUSDT', 'INJUSDT', 'SUIUSDT',
  'PEPEUSDT', 'SHIBUSDT',
];

const INTERVALS = [
  { label: '1m', value: '1m' }, { label: '5m', value: '5m' },
  { label: '15m', value: '15m' }, { label: '30m', value: '30m' },
  { label: '1H', value: '1h' }, { label: '2H', value: '2h' },
  { label: '4H', value: '4h' }, { label: '12H', value: '12h' },
  { label: '1D', value: '1d' }, { label: '1W', value: '1w' },
  { label: '1M', value: '1M' },
];

type Point = { time: UTCTimestamp; price: number };
type TrendLine = { id: string; p1: Point; p2: Point; color: string; width: number; dashed: boolean; locked: boolean };
type DrawMode = 'cursor' | 'trendline';

const COLORS = ['#2962ff', '#ffffff', '#26a69a', '#ef5350', '#ffb800', '#ab47bc'];
const WIDTHS = [1, 2, 3, 4];

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1d');
  const [search, setSearch] = useState('');
  const [drawMode, setDrawMode] = useState<DrawMode>('cursor');

  const [lines, setLines] = useState<TrendLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingPoint, setPendingPoint] = useState<Point | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number; price: number } | null>(null);
  const [mouseDataPoint, setMouseDataPoint] = useState<Point | null>(null);
  const [, setTick] = useState(0);
  const [openDropdown, setOpenDropdown] = useState<'color' | 'width' | 'style' | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const toolbarDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const dragRef = useRef<{ lineId: string; point: 'p1' | 'p2' } | null>(null);
  const drawModeRef = useRef<DrawMode>('cursor');
  const pendingRef = useRef<Point | null>(null);

  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { pendingRef.current = pendingPoint; }, [pendingPoint]);

  const forceRedraw = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#131722' }, textColor: '#D1D4DC', fontSize: 10 },
      grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;

    chart.timeScale().subscribeVisibleTimeRangeChange(forceRedraw);

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
        forceRedraw();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [forceRedraw]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (wsRef.current) wsRef.current.close();

    fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000`)
      .then((res) => res.json())
      .then((data) => {
        const candles = data.map((d: any) => ({
          time: (d[0] / 1000) as UTCTimestamp,
          open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]),
        }));
        series.setData(candles);
        chartRef.current?.timeScale().fitContent();
        forceRedraw();
      });

    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const k = msg.k;
      series.update({
        time: (k.t / 1000) as UTCTimestamp,
        open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c),
      });
      forceRedraw();
    };

    return () => ws.close();
  }, [symbol, interval, forceRedraw]);

  const toXY = (p: Point): { x: number; y: number } | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(p.time);
    const y = series.priceToCoordinate(p.price);
    if (x === null || y === null) return null;
    return { x, y };
  };

  const fromXY = (x: number, y: number): Point | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return { time: time as UTCTimestamp, price };
  };

  const HIT_RADIUS = 14;

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dp = fromXY(x, y);
    console.log('dp:', dp);
    setMouseDataPoint(dp);
    if (dp) setHoverPos({ x, y, price: dp.price });
    
    if (dragRef.current && dp) {
      const { lineId, point } = dragRef.current;
      setLines((prev) => prev.map((l) => (l.id === lineId && !l.locked ? { ...l, [point]: dp } : l)));
    }
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawModeRef.current === 'trendline') {
      const dp = fromXY(x, y);
      if (!dp) return;
      if (!pendingRef.current) {
        setPendingPoint(dp);
      } else {
        const newLine: TrendLine = {
          id: `line-${Date.now()}`, p1: pendingRef.current, p2: dp,
          color: '#2962ff', width: 2, dashed: false, locked: false,
        };
        setLines((prev) => [...prev, newLine]);
        setPendingPoint(null);
        setSelectedId(newLine.id);
        setToolbarPos(null);
        setDrawMode('cursor');
      }
      return;
    }

    for (const line of lines) {
      const a = toXY(line.p1);
      const b = toXY(line.p2);
      if (!a || !b) continue;
      if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) < 6) {
        setSelectedId(line.id);
        setToolbarPos(null);
        return;
      }
    }
    setSelectedId(null);
    setOpenDropdown(null);
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (drawModeRef.current !== 'cursor') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const line of lines) {
      if (line.locked) continue;
      const a = toXY(line.p1);
      const b = toXY(line.p2);
      if (a && Math.hypot(x - a.x, y - a.y) < HIT_RADIUS) {
        dragRef.current = { lineId: line.id, point: 'p1' };
        setSelectedId(line.id);
        return;
      }
      if (b && Math.hypot(x - b.x, y - b.y) < HIT_RADIUS) {
        dragRef.current = { lineId: line.id, point: 'p2' };
        setSelectedId(line.id);
        return;
      }
    }
  };

  const handleMouseUp = () => { dragRef.current = null; };

  const updateSelectedLine = (patch: Partial<TrendLine>) => {
    if (!selectedId) return;
    setLines((prev) => prev.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)));
  };

  const deleteSelectedLine = () => {
    setLines((prev) => prev.filter((l) => l.id !== selectedId));
    setSelectedId(null);
    setOpenDropdown(null);
    setToolbarPos(null);
  };

  // Przesuwanie samego paska narzędzi za uchwyt
  const handleToolbarDragStart = (e: MouseEvent<HTMLDivElement>) => {
    toolbarDragRef.current = { offsetX: e.clientX, offsetY: e.clientY };
    const onMove = (ev: globalThis.MouseEvent) => {
      if (!toolbarDragRef.current) return;
      const dx = ev.clientX - toolbarDragRef.current.offsetX;
      const dy = ev.clientY - toolbarDragRef.current.offsetY;
      setToolbarPos((prev) => {
        const base = prev ?? { x: 0, y: 0 };
        return { x: base.x + dx, y: base.y + dy };
      });
      toolbarDragRef.current = { offsetX: ev.clientX, offsetY: ev.clientY };
    };
    const onUp = () => {
      toolbarDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const filteredPairs = PAIRS.filter((p) => p.includes(search.toUpperCase()));
  const selectedLine = lines.find((l) => l.id === selectedId) || null;

  return (
    <main className="h-screen w-screen bg-[#131722] flex flex-col overflow-hidden text-[13px]">
      <header className="flex items-center gap-3 px-3 h-10 bg-[#1e222d] border-b border-[#2a2e39] shrink-0">
        <span className="text-white font-bold text-[12px]">📈 Trading Tools</span>
        <span className="text-gray-400 text-[10px]">{symbol}</span>
        <div className="flex flex-wrap gap-0.5">
          {INTERVALS.map((i) => (
            <button key={i.value} onClick={() => setInterval(i.value)}
              className={`px-2 py-1 rounded text-[10px] ${interval === i.value ? 'bg-[#2962ff] text-white' : 'text-gray-400 hover:bg-[#2a2e39]'}`}>
              {i.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-9 bg-[#1e222d] border-r border-[#2a2e39] shrink-0 flex flex-col items-center py-2 gap-1">
          <button onClick={() => { setDrawMode('cursor'); setPendingPoint(null); }} title="Kursor"
            className={`w-7 h-7 rounded flex items-center justify-center ${drawMode === 'cursor' ? 'bg-[#2962ff] text-white' : 'text-gray-400 hover:bg-[#2a2e39]'}`}>
            <MousePointer2 size={14} />
          </button>
          <button onClick={() => setDrawMode('trendline')} title="Linia trendu"
            className={`w-7 h-7 rounded flex items-center justify-center ${drawMode === 'trendline' ? 'bg-[#2962ff] text-white' : 'text-gray-400 hover:bg-[#2a2e39]'}`}>
            <TrendingUp size={14} />
          </button>
          <button onClick={() => { setLines([]); setSelectedId(null); setToolbarPos(null); }} title="Wyczyść rysunki"
            className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:bg-[#2a2e39]">
            <Trash2 size={14} />
          </button>
        </aside>

        <aside className="w-40 bg-[#1e222d] border-r border-[#2a2e39] shrink-0 flex flex-col overflow-hidden">
          <div className="p-1.5">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj pary..."
              className="w-full bg-[#2a2e39] text-white text-[10px] px-2 py-1 rounded outline-none" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredPairs.map((p) => (
              <button key={p} onClick={() => setSymbol(p)}
                className={`w-full text-left px-2 py-1.5 text-[10px] ${symbol === p ? 'bg-[#2a2e39] text-white' : 'text-gray-300 hover:bg-[#2a2e39]'}`}>
                {p}
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1 relative">
          <div ref={containerRef} className="absolute inset-0" />

          <div
            className="absolute inset-0"
            style={{ cursor: drawMode === 'trendline' ? 'crosshair' : 'default' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverPos(null)}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          >
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {lines.map((line) => {
                const a = toXY(line.p1);
                const b = toXY(line.p2);
                if (!a || !b) return null;
                const isSelected = line.id === selectedId;
                return (
                  <g key={line.id}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={line.color} strokeWidth={line.width}
                      strokeDasharray={line.dashed ? '6 4' : undefined} />
                    {isSelected && (
                      <>
                        <circle cx={a.x} cy={a.y} r={5} fill="#131722" stroke={line.color} strokeWidth={2} />
                        <circle cx={b.x} cy={b.y} r={5} fill="#131722" stroke={line.color} strokeWidth={2} />
                      </>
                    )}
                  </g>
                );
              })}

              {pendingPoint && mouseDataPoint && (() => {
                const a = toXY(pendingPoint);
                const b = toXY(mouseDataPoint);
                if (!a || !b) return null;
                return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.2)" strokeWidth={2} strokeDasharray="5 5" />;
              })()}
            </svg>

            {drawMode === 'trendline' && !pendingPoint && hoverPos && (
              <div className="absolute px-1.5 py-0.5 rounded text-[10px] text-white pointer-events-none"
                style={{ left: hoverPos.x + 12, top: hoverPos.y - 10, background: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>
                {hoverPos.price.toFixed(2)}
              </div>
            )}

            {lines.map((line) => {
              const b = toXY(line.p2);
              if (!b) return null;
              const change = ((line.p2.price - line.p1.price) / line.p1.price) * 100;
              const color = Math.abs(change) < 0.001 ? '#9598a1' : change > 0 ? '#26a69a' : '#ef5350';
              return (
                <div key={`label-${line.id}`}
                  className="absolute px-1.5 py-0.5 rounded text-[10px] font-medium pointer-events-none"
                  style={{ left: b.x + 8, top: b.y - 10, background: color, color: '#0d0f14' }}>
                  {change > 0 ? '+' : ''}{change.toFixed(2)}%
                </div>
              );
            })}

            {selectedLine && (() => {
              const a = toXY(selectedLine.p1);
              const b = toXY(selectedLine.p2);
              if (!a || !b) return null;
              const defaultX = (a.x + b.x) / 2 - 110;
              const defaultY = Math.max(Math.min(a.y, b.y) - 46, 4);
              const left = toolbarPos ? defaultX + toolbarPos.x : defaultX;
              const top = toolbarPos ? defaultY + toolbarPos.y : defaultY;

              return (
                <div
                  className="absolute flex flex-col bg-[#1e222d] border border-[#2a2e39] rounded-full shadow-lg text-white overflow-visible"
                  style={{ left, top }}
                >
                  <div className="flex items-center h-8 px-1">
                    <div
                      onMouseDown={handleToolbarDragStart}
                      className="w-5 h-6 flex items-center justify-center text-gray-500 cursor-grab active:cursor-grabbing"
                      title="Przesuń pasek"
                    >
                      <GripVertical size={13} />
                    </div>
                    <Divider />

                    {/* Kolor */}
                    <button
                      onClick={() => setOpenDropdown(openDropdown === 'color' ? null : 'color')}
                      title="Kolor"
                      className="w-7 h-6 flex items-center justify-center hover:bg-[#2a2e39] rounded"
                    >
                      <span className="w-3 h-3 rounded-full border border-white/40" style={{ background: selectedLine.color }} />
                    </button>
                    <Divider />

                    {/* Styl linii */}
                    <button
                      onClick={() => updateSelectedLine({ dashed: !selectedLine.dashed })}
                      title={selectedLine.dashed ? 'Przerywana (kliknij: ciągła)' : 'Ciągła (kliknij: przerywana)'}
                      className="w-7 h-6 flex items-center justify-center hover:bg-[#2a2e39] rounded text-gray-300"
                    >
                      <Minus size={14} strokeDasharray={selectedLine.dashed ? '3 2' : undefined} />
                    </button>
                    <Divider />

                    {/* Grubość */}
                    <button
                      onClick={() => setOpenDropdown(openDropdown === 'width' ? null : 'width')}
                      title="Grubość"
                      className="px-2 h-6 flex items-center justify-center hover:bg-[#2a2e39] rounded text-gray-300 text-[10px] whitespace-nowrap"
                    >
                      {selectedLine.width}px
                    </button>
                    <Divider />

                    {/* Blokada */}
                    <button
                      onClick={() => updateSelectedLine({ locked: !selectedLine.locked })}
                      title={selectedLine.locked ? 'Odblokuj' : 'Zablokuj'}
                      className="w-7 h-6 flex items-center justify-center hover:bg-[#2a2e39] rounded text-gray-300"
                    >
                      {selectedLine.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                    <Divider />

                    {/* Usuń */}
                    <button onClick={deleteSelectedLine} title="Usuń"
                      className="w-7 h-6 flex items-center justify-center hover:bg-[#3a1e1e] rounded text-red-400">
                      <Trash2 size={13} />
                    </button>
                    <Divider />

                    {/* Więcej (na przyszłe opcje) */}
                    <button
                      onClick={() => setOpenDropdown(openDropdown === 'style' ? null : 'style')}
                      title="Więcej"
                      className="w-7 h-6 flex items-center justify-center hover:bg-[#2a2e39] rounded text-gray-300"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>

                  {openDropdown === 'color' && (
                    <div className="flex gap-1.5 px-2.5 py-2 border-t border-[#2a2e39]">
                      {COLORS.map((c) => (
                        <button key={c} onClick={() => updateSelectedLine({ color: c })}
                          className="w-4 h-4 rounded-full border border-white/30" style={{ background: c }} />
                      ))}
                    </div>
                  )}

                  {openDropdown === 'width' && (
                    <div className="flex flex-col py-1 border-t border-[#2a2e39]">
                      {WIDTHS.map((w) => (
                        <button key={w} onClick={() => updateSelectedLine({ width: w })}
                          className="px-3 py-1 hover:bg-[#2a2e39] text-left text-[10px]">{w}px</button>
                      ))}
                    </div>
                  )}

                  {openDropdown === 'style' && (
                    <div className="flex flex-col py-1 border-t border-[#2a2e39]">
                      <button onClick={() => updateSelectedLine({ dashed: false })}
                        className="px-3 py-1 hover:bg-[#2a2e39] text-left text-[10px]">Linia ciągła</button>
                      <button onClick={() => updateSelectedLine({ dashed: true })}
                        className="px-3 py-1 hover:bg-[#2a2e39] text-left text-[10px]">Linia przerywana</button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </main>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-[#2a2e39] mx-0.5" />;
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let t = lenSq !== 0 ? dot / lenSq : -1;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * C), py - (y1 + t * D));
}