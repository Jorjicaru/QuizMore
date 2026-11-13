import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Territory, Player, GamePhase, WarRoundState, GameState } from '../types/game';
import {
  canTargetTerritory,
  canSelectBase,
  getMapAnimationConfig,
  computeTerritorySelectionVisualState,
  buildActiveAttackVectors,
  detectTerritoryMapTransitions,
  TerritoryMapTransition,
} from '../game/rules';
import { RoundTracker } from './RoundTracker';
import { sound } from '../services/audio';
import { Crosshair, Award, ZoomIn, ZoomOut, RotateCcw, MapPin, Layers } from 'lucide-react';

interface RomaniaMapProps {
  game?: GameState;
  territories: Record<string, Territory>;
  players: Player[];
  activePlayerId?: string;
  currentUserId?: string;
  gamePhase: GamePhase;
  selectedTerritoryId?: string | null;
  warRound?: WarRoundState | null;
  mapPresetPlayerCount?: number;
  onSelectTerritory: (territoryId: string) => void;
  disabled?: boolean;
}

interface LabelPlacement {
  cx: number;
  cy: number;
  boxW: number;
  boxH: number;
  displayText: string;
  fontSize: number;
  hasLeader: boolean;
}

export const RomaniaMap: React.FC<RomaniaMapProps> = ({
  game,
  territories,
  players,
  activePlayerId,
  currentUserId,
  gamePhase,
  selectedTerritoryId,
  warRound,
  mapPresetPlayerCount,
  onSelectTerritory,
  disabled = false,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(960);
  const [showInternalCounties, setShowInternalCounties] = useState<boolean>(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [activeTransitions, setActiveTransitions] = useState<
    Record<string, TerritoryMapTransition>
  >({});

  const prevTerritoriesRef = useRef<Record<string, Territory> | null>(null);
  const prevWarRoundRef = useRef<WarRoundState | null | undefined>(null);

  // Zoom & Pan state (Initial state is Fit to Screen: zoom = 1, pan = 0,0)
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialPanX: number;
    initialPanY: number;
    midSvgX: number;
    midSvgY: number;
  } | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const didDragRef = useRef<boolean>(false);
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    setPrefersReducedMotion(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
  }, []);

  const animConfig = useMemo(
    () => getMapAnimationConfig(prefersReducedMotion),
    [prefersReducedMotion]
  );

  // Detect authoritative server updates for neutral conquest, war conquest, defense shield, and tower hits
  useEffect(() => {
    const prevT = prevTerritoriesRef.current;
    const prevW = prevWarRoundRef.current;

    if (prevT) {
      const detected = detectTerritoryMapTransitions({
        prevTerritories: prevT,
        nextTerritories: territories,
        prevWarRound: prevW,
        nextWarRound: warRound,
        players,
        nowMs: Date.now(),
        prefersReducedMotion,
      });

      if (detected.length > 0) {
        setActiveTransitions((prev) => {
          const next = { ...prev };
          for (const tr of detected) {
            next[tr.territoryId] = tr;
          }
          return next;
        });

        const cleanupDelay = Math.max(
          650,
          ...detected.map((d) => (d.durationMs > 0 ? d.durationMs + 120 : 650))
        );
        const timer = window.setTimeout(() => {
          setActiveTransitions((current) => {
            const copy = { ...current };
            for (const tr of detected) {
              if (copy[tr.territoryId]?.id === tr.id) {
                delete copy[tr.territoryId];
              }
            }
            return copy;
          });
        }, cleanupDelay);

        prevTerritoriesRef.current = territories;
        prevWarRoundRef.current = warRound;
        return () => window.clearTimeout(timer);
      }
    }

    prevTerritoriesRef.current = territories;
    prevWarRoundRef.current = warRound;
  }, [territories, warRound, players, prefersReducedMotion]);

  useEffect(() => {
    const el = mapWrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setContainerWidth(rect.width);
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const targetedId = selectedTerritoryId || null;
  const currentUserPlayer = players.find((p) => p.id === currentUserId);

  // Simultaneous War: check if currentUserId is an attacker who still needs to select a target
  const myWarBattle =
    gamePhase === 'war' && warRound
      ? warRound.battles.find((b) => b.attackerId === currentUserId)
      : undefined;

  const isMyTurn =
    !disabled &&
    currentUserId !== undefined &&
    (gamePhase === 'war' && warRound
      ? Boolean(
          warRound.status === 'selecting_targets' &&
            myWarBattle &&
            myWarBattle.targetTerritoryId === null &&
            !myWarBattle.warActionType
        )
      : activePlayerId === currentUserId);

  const assignedDefenderId =
    gamePhase === 'war' && myWarBattle ? myWarBattle.defenderId : null;

  // All simultaneous war target territory IDs
  const warTargetedByTerritoryId = useMemo(() => {
    const map = new Map<string, { attacker: Player | undefined; defender: Player | undefined }>();
    if (gamePhase === 'war' && warRound?.battles) {
      for (const b of warRound.battles) {
        if (b.targetTerritoryId) {
          map.set(b.targetTerritoryId, {
            attacker: players.find((p) => p.id === b.attackerId),
            defender: players.find((p) => p.id === b.defenderId),
          });
        }
      }
    }
    return map;
  }, [gamePhase, warRound, players]);

  // Deterministic attack vectors (attacker origin territory -> target territory) visible to all players
  const activeAttackVectors = useMemo(
    () => buildActiveAttackVectors(territories, players, warRound, gamePhase),
    [territories, players, warRound, gamePhase]
  );

  const attackOriginByTerritoryId = useMemo(() => {
    const map = new Map<string, (typeof activeAttackVectors)[number]>();
    for (const vec of activeAttackVectors) {
      map.set(vec.sourceTerritoryId, vec);
    }
    return map;
  }, [activeAttackVectors]);

  const getOwner = (ownerId: string | null): Player | undefined => {
    if (!ownerId) return undefined;
    return players.find((p) => p.id === ownerId);
  };

  const handleTerritoryClick = (t: Territory) => {
    if (didDragRef.current || Date.now() < suppressClickUntilRef.current) {
      didDragRef.current = false;
      return;
    }

    setInspectedId(t.id);

    if (!isMyTurn || !currentUserPlayer) return;

    const check = canTargetTerritory(
      t.id,
      currentUserPlayer,
      territories,
      gamePhase as any,
      assignedDefenderId
    );
    if (!check.allowed) {
      sound.playWrong();
      onSelectTerritory(t.id); // Let server/GameView also show the exact rejection reason toast
      return;
    }

    sound.playClick();
    onSelectTerritory(t.id);
  };

  const clampPan = (nx: number, ny: number, z: number) => {
    const vw = 960 / z;
    const vh = 660 / z;
    return {
      x: Math.max(0, Math.min(960 - vw, nx)),
      y: Math.max(0, Math.min(660 - vh, ny)),
    };
  };

  const clientToSvgCoords = (
    clientX: number,
    clientY: number,
    currentZoom: number,
    currentPan: { x: number; y: number }
  ) => {
    const svgEl = svgRef.current;
    if (!svgEl) {
      return { svgX: 480, svgY: 330 };
    }
    const rect = svgEl.getBoundingClientRect();
    const relX = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0.5;
    const relY = rect.height > 0 ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : 0.5;
    return {
      svgX: currentPan.x + relX * (960 / currentZoom),
      svgY: currentPan.y + relY * (660 / currentZoom),
    };
  };

  const handleZoomIn = () => {
    setZoom((prev) => {
      const next = Math.min(3, Number((prev + 0.4).toFixed(2)));
      const prevW = 960 / prev;
      const prevH = 660 / prev;
      const nextW = 960 / next;
      const nextH = 660 / next;
      setPan((p) => clampPan(p.x + (prevW - nextW) / 2, p.y + (prevH - nextH) / 2, next));
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(1, Number((prev - 0.4).toFixed(2)));
      if (next === 1) {
        setPan({ x: 0, y: 0 });
      } else {
        const prevW = 960 / prev;
        const prevH = 660 / prev;
        const nextW = 960 / next;
        const nextH = 660 / next;
        setPan((p) => clampPan(p.x - (nextW - prevW) / 2, p.y - (nextH - prevH) / 2, next));
      }
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    pinchStateRef.current = null;
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') return;
    if (zoom <= 1) return;
    setIsDragging(true);
    didDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') return;
    if (!isDragging || !dragStartRef.current || zoom <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > 6) {
      didDragRef.current = true;
      suppressClickUntilRef.current = Date.now() + 200;
    }
    const scaleFactor = (960 / zoom) / Math.max(280, containerWidth);
    const nextPan = clampPan(
      dragStartRef.current.panX - dx * scaleFactor,
      dragStartRef.current.panY - dy * scaleFactor,
      zoom
    );
    setPan(nextPan);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') return;
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midClientX = (t0.clientX + t1.clientX) / 2;
      const midClientY = (t0.clientY + t1.clientY) / 2;
      const { svgX, svgY } = clientToSvgCoords(midClientX, midClientY, zoom, pan);

      didDragRef.current = true;
      suppressClickUntilRef.current = Date.now() + 450;
      setIsDragging(false);
      dragStartRef.current = null;
      pinchStateRef.current = {
        initialDistance: Math.max(20, dist),
        initialZoom: zoom,
        initialPanX: pan.x,
        initialPanY: pan.y,
        midSvgX: svgX,
        midSvgY: svgY,
      };
    } else if (e.touches.length === 1 && !pinchStateRef.current) {
      if (zoom > 1) {
        setIsDragging(true);
        didDragRef.current = false;
        dragStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          panX: pan.x,
          panY: pan.y,
        };
      } else {
        setIsDragging(false);
        dragStartRef.current = null;
        didDragRef.current = false;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2 && pinchStateRef.current) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const pinch = pinchStateRef.current;
      const ratio = dist / pinch.initialDistance;
      const nextZoom = Math.max(1, Math.min(3, Number((pinch.initialZoom * ratio).toFixed(2))));

      didDragRef.current = true;
      suppressClickUntilRef.current = Date.now() + 450;

      if (nextZoom <= 1.01) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else {
        const initVW = 960 / pinch.initialZoom;
        const initVH = 660 / pinch.initialZoom;
        const relX = (pinch.midSvgX - pinch.initialPanX) / initVW;
        const relY = (pinch.midSvgY - pinch.initialPanY) / initVH;
        const nextVW = 960 / nextZoom;
        const nextVH = 660 / nextZoom;
        const rawPanX = pinch.midSvgX - relX * nextVW;
        const rawPanY = pinch.midSvgY - relY * nextVH;
        setZoom(nextZoom);
        setPan(clampPan(rawPanX, rawPanY, nextZoom));
      }
    } else if (
      e.touches.length === 1 &&
      isDragging &&
      dragStartRef.current &&
      zoom > 1 &&
      !pinchStateRef.current
    ) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 6) {
        didDragRef.current = true;
        suppressClickUntilRef.current = Date.now() + 280;
      }
      const scaleFactor = (960 / zoom) / Math.max(280, containerWidth);
      const nextPan = clampPan(
        dragStartRef.current.panX - dx * scaleFactor,
        dragStartRef.current.panY - dy * scaleFactor,
        zoom
      );
      setPan(nextPan);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length < 2) {
      pinchStateRef.current = null;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
      dragStartRef.current = null;
    }
  };

  const territoryList = Object.values(territories);
  const activeInspectId = hoveredId || inspectedId || targetedId;
  const activeTerritory = activeInspectId ? territories[activeInspectId] : null;
  const activeOwner = activeTerritory ? getOwner(activeTerritory.ownerId) : null;

  const isMobileMap = containerWidth < 560;
  const labelScale = containerWidth < 400 ? 1.45 : containerWidth < 600 ? 1.25 : 1.05;

  // Compute collision-free label placements for all Base Castles
  const baseLabelPlacements = useMemo(() => {
    const placements: Record<string, LabelPlacement> = {};
    const occupied: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    const bases = territoryList
      .filter((t) => t.isBase && getOwner(t.ownerId))
      .sort((a, b) => a.labelY - b.labelY || a.labelX - b.labelX);

    for (const b of bases) {
      occupied.push({
        x1: b.labelX - 24,
        y1: b.labelY - 18,
        x2: b.labelX + 24,
        y2: b.labelY + 46,
      });
    }

    for (const b of bases) {
      const owner = getOwner(b.ownerId)!;
      const maxChars = isMobileMap ? 12 : 16;
      const displayText =
        owner.username.length > maxChars
          ? `${owner.username.slice(0, maxChars - 1)}…`
          : owner.username;

      const fontSize = Number((10 * labelScale).toFixed(1));
      const charWidth = fontSize * 0.62;
      const boxW = Math.max(66 * labelScale, displayText.length * charWidth + 16 * labelScale);
      const boxH = Math.round(18 * labelScale);

      const candidates = [
        { dx: 0, dy: -29 * labelScale },
        { dx: 0, dy: 54 * labelScale },
        { dx: -52 * labelScale, dy: -26 * labelScale },
        { dx: 52 * labelScale, dy: -26 * labelScale },
        { dx: -68 * labelScale, dy: 2 },
        { dx: 68 * labelScale, dy: 2 },
        { dx: -52 * labelScale, dy: 50 * labelScale },
        { dx: 52 * labelScale, dy: 50 * labelScale },
        { dx: 0, dy: -46 * labelScale },
      ];

      let bestCx = b.labelX;
      let bestCy = b.labelY - 29 * labelScale;
      let bestOverlap = Number.POSITIVE_INFINITY;

      for (const cand of candidates) {
        const cx = Math.max(boxW / 2 + 8, Math.min(952 - boxW / 2, b.labelX + cand.dx));
        const cy = Math.max(boxH / 2 + 8, Math.min(652 - boxH / 2, b.labelY + cand.dy));
        const rect = {
          x1: cx - boxW / 2 - 3,
          y1: cy - boxH / 2 - 2,
          x2: cx + boxW / 2 + 3,
          y2: cy + boxH / 2 + 2,
        };

        let overlapArea = 0;
        for (const occ of occupied) {
          const ox = Math.max(0, Math.min(rect.x2, occ.x2) - Math.max(rect.x1, occ.x1));
          const oy = Math.max(0, Math.min(rect.y2, occ.y2) - Math.max(rect.y1, occ.y1));
          overlapArea += ox * oy;
        }

        if (overlapArea < bestOverlap) {
          bestOverlap = overlapArea;
          bestCx = cx;
          bestCy = cy;
          if (overlapArea === 0) break;
        }
      }

      occupied.push({
        x1: bestCx - boxW / 2,
        y1: bestCy - boxH / 2,
        x2: bestCx + boxW / 2,
        y2: bestCy + boxH / 2,
      });

      const dist = Math.hypot(bestCx - b.labelX, bestCy - (b.labelY - 28 * labelScale));
      placements[b.id] = {
        cx: bestCx,
        cy: bestCy,
        boxW,
        boxH,
        displayText,
        fontSize,
        hasLeader: dist > 14,
      };
    }

    return placements;
  }, [territoryList, players, isMobileMap, labelScale]);

  const viewBoxStr = `${pan.x.toFixed(1)} ${pan.y.toFixed(1)} ${(960 / zoom).toFixed(1)} ${(660 / zoom).toFixed(1)}`;
  const effectivePlayerPreset = mapPresetPlayerCount || Math.max(2, players.length);

  return (
    <div
      ref={mapWrapperRef}
      data-testid="romania-map-container"
      className="relative flex-1 min-h-0 w-full overflow-hidden rounded-2xl border-2 border-stone-800/90 shadow-2xl select-none flex flex-col justify-between"
      style={{
        background:
          'radial-gradient(ellipse at 50% 45%, #4a2d18 0%, #2e1a0d 45%, #180d06 90%, #0d0703 100%)',
        boxShadow: 'inset 0 0 60px rgba(0, 0, 0, 0.9), 0 10px 30px rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* Top Overlay Header: Preset & Zone Count + Current Phase Action Prompt */}
      <div className="pointer-events-none absolute top-1.5 sm:top-2 left-2 right-2 z-10 flex flex-wrap items-center justify-between gap-1.5">
        <div
          data-testid="map-preset-badge"
          className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-stone-950/85 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[9px] sm:text-[11px] shadow-lg backdrop-blur-md max-w-full"
        >
          <Crosshair className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-400 shrink-0" />
          <span className="font-serif font-bold tracking-wider text-amber-200 truncate">
            Harta României &bull; {effectivePlayerPreset} Jucători &bull; {territoryList.length} Teritorii
          </span>
        </div>

        {isMyTurn && (
          <div className="flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-500/25 px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-[0_0_15px_rgba(245,158,11,0.5)] backdrop-blur-md max-w-full">
            <span className="text-[9px] sm:text-[11px] font-serif font-black tracking-wide text-amber-200 truncate">
              {gamePhase === 'base_selection'
                ? 'ALEGE BAZA TA (1000 PCT)'
                : gamePhase === 'conquest'
                ? 'CUCEREȘTE ZONĂ ÎNVECINATĂ (200 PCT)'
                : gamePhase === 'allocation'
                ? 'ALEGE TERITORIU LIBER (300 PCT)'
                : 'ATACĂ ȚINTA INAMICĂ (400 PCT)'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom-Left Controls: Zoom & Fit-to-Screen + Discrete County Lines Toggle */}
      <div className="absolute bottom-9 sm:bottom-10 left-2 z-20 flex items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 shadow-xl backdrop-blur-md">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Mărește Harta (Zoom In)"
          aria-label="Zoom In"
          data-testid="map-zoom-in"
          className="flex h-8 w-8 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-stone-900 text-amber-300 hover:bg-stone-800 active:scale-95 transition"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= 1}
          title="Micșorează Harta (Zoom Out)"
          aria-label="Zoom Out"
          data-testid="map-zoom-out"
          className="flex h-8 w-8 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-stone-900 text-stone-300 hover:bg-stone-800 disabled:opacity-40 active:scale-95 transition"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          disabled={zoom <= 1 && pan.x === 0 && pan.y === 0}
          title="Încadrează toată harta în ecran (Reset Zoom)"
          aria-label="Reset Zoom"
          data-testid="map-zoom-reset"
          className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-bold transition active:scale-95 ${
            zoom > 1
              ? 'bg-amber-500/25 text-amber-200 border border-amber-500/50 hover:bg-amber-500/35'
              : 'bg-stone-900/60 text-stone-500 opacity-50'
          }`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>1:1</span>
        </button>
        <button
          type="button"
          onClick={() => setShowInternalCounties((prev) => !prev)}
          title={
            showInternalCounties
              ? 'Ascunde conturul județelor componente'
              : 'Afișează conturul județelor componente'
          }
          data-testid="toggle-county-lines"
          className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold transition ${
            showInternalCounties
              ? 'bg-stone-900 text-stone-300 hover:bg-stone-800'
              : 'bg-stone-900/50 text-stone-500 hover:bg-stone-800/70'
          }`}
        >
          <Layers className="h-3.5 w-3.5 text-amber-400/80" />
          <span className="hidden sm:inline">Județe</span>
        </button>
      </div>

      {/* Bottom-Right Compact Round Tracker Overlay (desktop/tablet only so mobile southern map is unobstructed) */}
      {game && (
        <div className="pointer-events-none hidden sm:block absolute bottom-10 right-2 z-20">
          <RoundTracker game={game} />
        </div>
      )}

      {/* SVG Canvas Container */}
      <div className="w-full flex-1 min-h-0 flex items-center justify-center p-1 sm:p-2 overflow-hidden">
        <svg
          ref={svgRef}
          data-testid="romania-map-svg"
          viewBox={viewBoxStr}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{ touchAction: zoom > 1 ? 'none' : 'manipulation' }}
          className={`w-full h-full max-h-full aspect-[960/660] filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.95)] ${
            zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
        >
          <defs>
            <pattern
              id="diamond-hatch"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="24" height="24" fill="transparent" />
              <line x1="0" y1="0" x2="0" y2="24" stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" />
              <line x1="0" y1="0" x2="24" y2="0" stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" />
            </pattern>

            <pattern
              id="selected-hatch"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="14"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeOpacity="0.4"
              />
            </pattern>

            <pattern
              id="origin-hatch"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="14"
                stroke="#fb923c"
                strokeWidth="2.4"
                strokeOpacity="0.38"
              />
            </pattern>

            <filter id="arrow-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0284c7" floodOpacity="0.8" />
            </filter>

            <filter id="border-relief" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.8" />
            </filter>

            <filter id="territory-hover-glow" x="-18%" y="-18%" width="136%" height="136%">
              <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#f59e0b" floodOpacity="0.72" />
            </filter>

            <filter id="territory-select-glow" x="-22%" y="-22%" width="144%" height="144%">
              <feDropShadow dx="0" dy="2" stdDeviation="4.5" floodColor="#38bdf8" floodOpacity="0.85" />
            </filter>

            <filter id="territory-origin-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#fb923c" floodOpacity="0.8" />
            </filter>

            <filter id="territory-attack-glow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="#f43f5e" floodOpacity="0.9" />
            </filter>

            {/* Clip paths for each territory so conquest radial spread fills the exact polygon */}
            {territoryList.map((t) => {
              const isPath = t.svgPath.startsWith('M');
              return (
                <clipPath key={`clip_${t.id}`} id={`clip-territory-${t.id}`}>
                  {isPath ? <path d={t.svgPath} /> : <polygon points={t.svgPath} />}
                </clipPath>
              );
            })}
          </defs>

          {/* ============================================================
              LAYER 1: DISSOLVED TERRITORY EXTERIOR POLYGONS & TEXTURES
          ============================================================ */}
          <g id="layer-territories">
            {territoryList.map((t) => {
              const owner = getOwner(t.ownerId);
              const warTargetEntry = warTargetedByTerritoryId.get(t.id);
              const attackOriginEntry = attackOriginByTerritoryId.get(t.id);
              const isAttackTarget = Boolean(warTargetEntry);
              const isAttackOrigin = Boolean(attackOriginEntry);

              const activeBattleWithTarget =
                gamePhase === 'war' && warRound?.battles
                  ? warRound.battles.find((b) => Boolean(b.targetTerritoryId))
                  : undefined;
              const isAttackerTerritory = Boolean(
                activeBattleWithTarget &&
                  t.ownerId &&
                  t.ownerId === activeBattleWithTarget.attackerId
              );
              const isDefenderTerritory = Boolean(
                activeBattleWithTarget &&
                  t.ownerId &&
                  t.ownerId === activeBattleWithTarget.defenderId
              );

              const isSelected = targetedId === t.id || isAttackTarget;
              const isInspected = inspectedId === t.id;
              const transition = activeTransitions[t.id];

              let isActionable = false;
              let isForbiddenBase = false;

              if (isMyTurn && currentUserPlayer) {
                const check = canTargetTerritory(
                  t.id,
                  currentUserPlayer,
                  territories,
                  gamePhase as any,
                  assignedDefenderId
                );
                isActionable = check.allowed;

                if (
                  gamePhase === 'base_selection' &&
                  t.ownerId === null &&
                  !canSelectBase(t.id, territories)
                ) {
                  isForbiddenBase = true;
                }
              }

              const isConquestSpreadActive =
                animConfig.enabled &&
                Boolean(
                  transition &&
                    (transition.type === 'neutral_conquest' || transition.type === 'war_conquest')
                );

              let fillColor = '#d5c4a1';
              let fillOpacity = 0.88;

              if (isConquestSpreadActive && transition) {
                // Show previous surface color underneath while the new team color spreads radially over it
                fillColor = transition.previousColor || '#d5c4a1';
                fillOpacity = 0.9;
              } else if (owner) {
                fillColor = owner.color;
                if (activeBattleWithTarget) {
                  fillOpacity = isAttackerTerritory || isDefenderTerritory ? 0.96 : 0.48;
                } else {
                  fillOpacity =
                    isMyTurn && !isActionable && t.ownerId !== currentUserId ? 0.62 : 0.92;
                }
              } else if (isForbiddenBase) {
                fillColor = '#78716c';
                fillOpacity = 0.5;
              } else if (isMyTurn && !isActionable) {
                fillColor = '#9ca3af';
                fillOpacity = 0.45;
              }

              const isAttackPreviewPhase =
                gamePhase === 'war' && warRound?.status === 'attack_preview';
              const isHovered = hoveredId === t.id;

              const visualState = computeTerritorySelectionVisualState({
                territoryId: t.id,
                hasOwner: Boolean(owner),
                ownerColor: owner?.color,
                isHovered,
                isSelected,
                isTouchSelected: isInspected,
                isActionable,
                isAttackOrigin,
                isAttackTarget,
                isAttackerTerritory,
                isDefenderTerritory,
                isAttackPreviewPhase,
              });

              const isPath = t.svgPath.startsWith('M');
              const shouldElevate =
                animConfig.enabled &&
                (visualState.isHovered ||
                  visualState.isTouchSelected ||
                  visualState.isSelected ||
                  visualState.isAttackOrigin);

              return (
                <g
                  key={t.id}
                  data-testid={`territory-${t.id}`}
                  data-owner={t.ownerId || 'neutral'}
                  data-actionable={isActionable ? 'true' : 'false'}
                  data-selected={visualState.isHighlighted ? 'true' : 'false'}
                  data-attack-origin={isAttackOrigin ? 'true' : 'false'}
                  data-attack-target={isAttackTarget ? 'true' : 'false'}
                  data-attacker-territory={isAttackerTerritory ? 'true' : 'false'}
                  data-defender-territory={isDefenderTerritory ? 'true' : 'false'}
                  data-transition={transition?.type || 'none'}
                  className={`territory-interactive ${shouldElevate ? 'territory-elevated' : ''} ${
                    isActionable
                      ? 'cursor-pointer hover:brightness-110'
                      : isMyTurn
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                  onMouseEnter={() => setHoveredId(t.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onTouchStart={() => setInspectedId(t.id)}
                  onClick={() => handleTerritoryClick(t)}
                >
                  {isPath ? (
                    <path
                      d={t.svgPath}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={visualState.strokeColor}
                      strokeWidth={visualState.strokeWidth}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeDasharray={
                        isSelected ? '6 4' : isAttackOrigin ? '8 3' : undefined
                      }
                      filter={visualState.filterId}
                      className="territory-shape"
                    />
                  ) : (
                    <polygon
                      points={t.svgPath}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={visualState.strokeColor}
                      strokeWidth={visualState.strokeWidth}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeDasharray={
                        isSelected ? '6 4' : isAttackOrigin ? '8 3' : undefined
                      }
                      filter={visualState.filterId}
                      className="territory-shape"
                    />
                  )}

                  {/* Conquest Radial Color Spread inside Territory ClipPath */}
                  {isConquestSpreadActive && transition && (
                    <g
                      clipPath={`url(#clip-territory-${t.id})`}
                      className="pointer-events-none"
                      data-testid={`conquest-spread-${t.id}`}
                    >
                      <circle
                        cx={transition.targetX}
                        cy={transition.targetY}
                        r={240}
                        fill={transition.color}
                        fillOpacity={0.94}
                        className="animate-conquest-spread"
                      />
                    </g>
                  )}

                  {/* Subtle decorative internal county lines (Section 48: very thin, low opacity, non-interactive) */}
                  {showInternalCounties && t.internalLinesSvg && (
                    <path
                      d={t.internalLinesSvg}
                      fill="none"
                      stroke="rgba(28, 17, 9, 0.11)"
                      strokeWidth="0.55"
                      strokeDasharray="2 3"
                      className="pointer-events-none"
                    />
                  )}

                  {owner &&
                    (isPath ? (
                      <path
                        d={t.svgPath}
                        fill="url(#diamond-hatch)"
                        stroke="none"
                        className="pointer-events-none"
                      />
                    ) : (
                      <polygon
                        points={t.svgPath}
                        fill="url(#diamond-hatch)"
                        stroke="none"
                        className="pointer-events-none"
                      />
                    ))}

                  {isAttackOrigin &&
                    !isSelected &&
                    (isPath ? (
                      <path
                        d={t.svgPath}
                        fill="url(#origin-hatch)"
                        stroke="none"
                        className="pointer-events-none"
                      />
                    ) : (
                      <polygon
                        points={t.svgPath}
                        fill="url(#origin-hatch)"
                        stroke="none"
                        className="pointer-events-none"
                      />
                    ))}

                  {isSelected &&
                    (isPath ? (
                      <path
                        d={t.svgPath}
                        fill="url(#selected-hatch)"
                        stroke="none"
                        className="pointer-events-none animate-pulse motion-reduce:animate-none"
                      />
                    ) : (
                      <polygon
                        points={t.svgPath}
                        fill="url(#selected-hatch)"
                        stroke="none"
                        className="pointer-events-none animate-pulse motion-reduce:animate-none"
                      />
                    ))}

                  {/* Luminous outline pulse at the end of a conquest */}
                  {transition &&
                    (transition.type === 'neutral_conquest' ||
                      transition.type === 'war_conquest') &&
                    (isPath ? (
                      <path
                        d={t.svgPath}
                        fill="none"
                        stroke="#fef08a"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="pointer-events-none animate-conquest-pulse"
                      />
                    ) : (
                      <polygon
                        points={t.svgPath}
                        fill="none"
                        stroke="#fef08a"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="pointer-events-none animate-conquest-pulse"
                      />
                    ))}
                </g>
              );
            })}
          </g>

          {/* ============================================================
              LAYER 2: REGULAR TERRITORY SCORES (200 / 300 / 400) & FORBIDDEN MARKERS
          ============================================================ */}
          <g id="layer-regular-scores" className="pointer-events-none">
            {territoryList.map((t) => {
              const owner = getOwner(t.ownerId);
              const isForbiddenBase =
                isMyTurn &&
                currentUserPlayer &&
                gamePhase === 'base_selection' &&
                t.ownerId === null &&
                !canSelectBase(t.id, territories);

              if (t.isBase && owner) return null;

              const scoreFontSize = Number((13 * labelScale).toFixed(1));

              return (
                <g key={`score_${t.id}`} transform={`translate(${t.labelX}, ${t.labelY})`}>
                  {owner ? (
                    <g>
                      <rect
                        x={-16 * labelScale}
                        y={-9 * labelScale}
                        width={32 * labelScale}
                        height={18 * labelScale}
                        rx={5 * labelScale}
                        fill="#1c1109"
                        fillOpacity="0.72"
                        stroke="#fde68a"
                        strokeOpacity="0.45"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y={4.5 * labelScale}
                        textAnchor="middle"
                        fontSize={scoreFontSize}
                        fontWeight="900"
                        fill="#fef3c7"
                        fontFamily="Georgia, serif"
                      >
                        {t.points || 200}
                      </text>

                      {!!t.defensiveBonus && (
                        <g transform={`translate(${20 * labelScale}, ${-10 * labelScale})`}>
                          <circle
                            cx="0"
                            cy="0"
                            r={8 * labelScale}
                            fill="#059669"
                            stroke="#34d399"
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y={3 * labelScale}
                            textAnchor="middle"
                            fontSize={7 * labelScale}
                            fontWeight="bold"
                            fill="#ffffff"
                          >
                            +{t.defensiveBonus}
                          </text>
                        </g>
                      )}
                    </g>
                  ) : null}

                  {isForbiddenBase && (
                    <g>
                      <circle cx="0" cy="0" r={10 * labelScale} fill="#dc2626" fillOpacity="0.85" />
                      <line
                        x1={-5 * labelScale}
                        y1={-5 * labelScale}
                        x2={5 * labelScale}
                        y2={5 * labelScale}
                        stroke="#ffffff"
                        strokeWidth="2.2"
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* ============================================================
              LAYER 3: CASTLE MEDALLIONS, ENLARGED 3 TOWERS, 1000 SCORES & NAMEPLATES
          ============================================================ */}
          <g id="layer-castles" className="pointer-events-none">
            {territoryList.map((t) => {
              const owner = getOwner(t.ownerId);
              if (!t.isBase || !owner) return null;

              const placement = baseLabelPlacements[t.id];
              const isTowerHit = activeTransitions[t.id]?.type === 'tower_hit';
              const towerScale = isMobileMap ? 1.32 : 1.18;
              const intactCount = Math.max(0, Math.min(3, t.castleTowers ?? 3));

              return (
                <g
                  key={`castle_${t.id}`}
                  data-testid={`castle-${t.id}`}
                  data-towers={intactCount}
                  className={isTowerHit ? 'animate-castle-shake' : undefined}
                >
                  {placement && placement.hasLeader && (
                    <line
                      x1={t.labelX}
                      y1={t.labelY}
                      x2={placement.cx}
                      y2={placement.cy}
                      stroke="#fde047"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      opacity="0.85"
                    />
                  )}

                  <g transform={`translate(${t.labelX}, ${t.labelY})`}>
                    <circle
                      cx="0"
                      cy="0"
                      r="16.5"
                      fill={owner.color}
                      stroke="#fef08a"
                      strokeWidth="2.6"
                      filter="drop-shadow(0 2px 5px rgba(0,0,0,0.88))"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r="13.2"
                      fill="none"
                      stroke="#b45309"
                      strokeWidth="1.5"
                    />
                    <text
                      x="0"
                      y="5.5"
                      textAnchor="middle"
                      fontSize="14.5"
                      fill="#fef08a"
                      fontWeight="bold"
                    >
                      ♞
                    </text>

                    {/* Enlarged, high-contrast 3 Castle Towers bar */}
                    <g
                      transform={`translate(0, 22) scale(${towerScale})`}
                      data-testid={`castle-towers-${t.id}`}
                    >
                      <rect
                        x="-21"
                        y="-8.5"
                        width="42"
                        height="14.5"
                        rx="3.5"
                        fill="#0c0a09"
                        fillOpacity="0.92"
                        stroke={isTowerHit ? '#fb7185' : '#f59e0b'}
                        strokeWidth="1.1"
                      />
                      {[0, 1, 2].map((idx) => {
                        const intact = idx < intactCount;
                        const posX = (idx - 1) * 12;
                        return (
                          <g
                            key={idx}
                            data-testid={`castle-tower-${t.id}-${idx}`}
                            data-intact={intact ? 'true' : 'false'}
                            transform={`translate(${posX}, 0)`}
                          >
                            <rect
                              x="-4.2"
                              y="-4.5"
                              width="8.4"
                              height="9"
                              rx="1.4"
                              fill={intact ? '#f59e0b' : '#27272a'}
                              stroke={intact ? '#fef08a' : '#71717a'}
                              strokeWidth="1"
                            />
                            {/* Battlements (creneluri) */}
                            <rect
                              x="-4.2"
                              y="-6.8"
                              width="2.4"
                              height="2.4"
                              fill={intact ? '#fef08a' : '#52525b'}
                            />
                            <rect
                              x="-1"
                              y="-6.8"
                              width="2"
                              height="2.4"
                              fill={intact ? '#fef08a' : '#52525b'}
                            />
                            <rect
                              x="1.8"
                              y="-6.8"
                              width="2.4"
                              height="2.4"
                              fill={intact ? '#fef08a' : '#52525b'}
                            />
                            {!intact && (
                              <g stroke="#fb7185" strokeWidth="1.3" strokeLinecap="round">
                                <line x1="-2.5" y1="-2.5" x2="2.5" y2="2.5" />
                                <line x1="2.5" y1="-2.5" x2="-2.5" y2="2.5" />
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </g>

                    {/* Base Score 1000 only */}
                    <g transform={`translate(0, ${22 + 15 * towerScale})`}>
                      <rect
                        x="-19"
                        y="-7"
                        width="38"
                        height="13.5"
                        rx="4"
                        fill="#1c1109"
                        fillOpacity="0.9"
                        stroke="#eab308"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="2.8"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="900"
                        fill="#fef08a"
                        fontFamily="Georgia, serif"
                      >
                        1000
                      </text>
                    </g>
                  </g>

                  {placement && (
                    <g transform={`translate(${placement.cx}, ${placement.cy})`}>
                      <rect
                        x={-placement.boxW / 2}
                        y={-placement.boxH / 2}
                        width={placement.boxW}
                        height={placement.boxH}
                        rx="4.5"
                        fill="#1c1109"
                        fillOpacity="0.92"
                        stroke="#eab308"
                        strokeWidth="1.3"
                        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.85))"
                      />
                      <text
                        x="0"
                        y={placement.fontSize * 0.36}
                        textAnchor="middle"
                        fontSize={placement.fontSize}
                        fontWeight="800"
                        fill="#fef08a"
                        fontFamily="sans-serif"
                      >
                        {placement.displayText}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* ============================================================
              LAYER 4: WAR ATTACK VECTORS (ORIGIN -> TARGET ARROWS ONLY, NO OVERLAPPING TEXT)
          ============================================================ */}
          <g id="layer-attack-vectors" className="pointer-events-none">
            {activeAttackVectors.map((vec) => {
              const pathD = `M ${vec.fromX} ${vec.fromY} Q ${vec.controlX} ${vec.controlY} ${vec.toX} ${vec.toY}`;

              return (
                <g
                  key={`attack_vec_${vec.battleId}`}
                  data-testid={`attack-vector-${vec.battleId}`}
                  data-source-territory={vec.sourceTerritoryId}
                  data-target-territory={vec.targetTerritoryId}
                >
                  {/* Attacker Origin Territory Beacon Ring */}
                  <g transform={`translate(${vec.fromX}, ${vec.fromY})`}>
                    <circle
                      cx="0"
                      cy="0"
                      r="20"
                      fill="none"
                      stroke={vec.attackerColor}
                      strokeWidth="2.6"
                      className="animate-attack-beacon"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r="6"
                      fill={vec.attackerColor}
                      stroke="#fef08a"
                      strokeWidth="1.6"
                    />
                  </g>

                  {/* Curved Tactical Vector Casing & Glowing Base Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#090d16"
                    strokeWidth="6.5"
                    strokeLinecap="round"
                    opacity="0.78"
                  />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={vec.attackerColor}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    opacity="0.92"
                  />
                  {/* Marching Energy Dashes Flowing from Attacker to Target */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#fef08a"
                    strokeWidth="2.4"
                    strokeDasharray="10 8"
                    strokeLinecap="round"
                    className="animate-attack-dash"
                  />

                  {/* Directional Arrowhead at Target End */}
                  <g
                    transform={`translate(${vec.toX}, ${vec.toY}) rotate(${vec.angleDeg})`}
                    filter="url(#arrow-glow)"
                  >
                    <polygon
                      points="0,0 -15,-7.5 -11,0 -15,7.5"
                      fill={vec.attackerColor}
                      stroke="#fef08a"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </g>

                  {/* Target Siege / Impact Ring */}
                  <g
                    transform={`translate(${vec.toX}, ${vec.toY})`}
                    data-testid={`attack-siege-ring-${vec.battleId}`}
                  >
                    <circle
                      cx="0"
                      cy="0"
                      r="26"
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="3"
                      className="animate-conquest-ring"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r="22"
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2.2"
                      strokeDasharray="5 4"
                    />
                  </g>
                </g>
              );
            })}

            {/* Downward Pointer Arrows over All Simultaneous War Targets or Selected Territory */}
            {territoryList.map((t) => {
              const warEntry = warTargetedByTerritoryId.get(t.id);
              const isTargeted = targetedId === t.id || Boolean(warEntry);
              if (!isTargeted) return null;
              const arrowFill = warEntry?.attacker?.color || '#0284c7';

              return (
                <g
                  key={`arrow_${t.id}`}
                  transform={`translate(${t.labelX}, ${t.labelY - 32})`}
                  className="animate-bounce motion-reduce:animate-none"
                  filter="url(#arrow-glow)"
                >
                  <rect
                    x="-6"
                    y="-36"
                    width="12"
                    height="22"
                    fill={arrowFill}
                    stroke="#fef08a"
                    strokeWidth="1.5"
                    rx="2"
                  />
                  <polygon
                    points="0,0 -16,-16 -6,-16 -6,-36 6,-36 6,-16 16,-16"
                    fill={arrowFill}
                    stroke="#fef08a"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <polygon
                    points="0,-2 -12,-15 -4,-15 -4,-34 0,-34"
                    fill="#ffffff"
                    opacity="0.35"
                  />
                </g>
              );
            })}
          </g>

          {/* ============================================================
              LAYER 5: POST-BATTLE OUTCOME EFFECTS (RINGS & SHIELD/IMPACT EMBLEMS ONLY)
          ============================================================ */}
          <g id="layer-battle-outcomes" className="pointer-events-none">
            {Object.values(activeTransitions).map((tr) => {
              if (tr.type === 'neutral_conquest' || tr.type === 'war_conquest') {
                return (
                  <g
                    key={tr.id}
                    data-testid={`transition-effect-${tr.territoryId}`}
                    data-transition-type={tr.type}
                    transform={`translate(${tr.targetX}, ${tr.targetY})`}
                  >
                    <circle
                      cx="0"
                      cy="0"
                      r="26"
                      fill="none"
                      stroke={tr.color}
                      strokeWidth="3.5"
                      className="animate-conquest-ring"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r="18"
                      fill="none"
                      stroke="#fef08a"
                      strokeWidth="2.2"
                      className="animate-conquest-ring"
                    />
                  </g>
                );
              }

              // war_defense or tower_hit: shield / explosion ripple without overlapping text labels
              const isShield = tr.type === 'war_defense';
              const ringStroke = isShield ? '#34d399' : '#fb7185';
              const emblemFill = isShield ? '#059669' : '#e11d48';

              return (
                <g
                  key={tr.id}
                  data-testid={`transition-effect-${tr.territoryId}`}
                  data-transition-type={tr.type}
                  transform={`translate(${tr.targetX}, ${tr.targetY})`}
                >
                  <circle
                    cx="0"
                    cy="0"
                    r="30"
                    fill="none"
                    stroke={ringStroke}
                    strokeWidth="3.8"
                    className="animate-defense-ripple"
                  />
                  <g className="animate-defense-shield">
                    <path
                      d="M 0 -18 L 15 -11 L 15 2 C 15 12 0 19 0 19 C 0 19 -15 12 -15 2 L -15 -11 Z"
                      fill={emblemFill}
                      fillOpacity="0.92"
                      stroke="#fef08a"
                      strokeWidth="2"
                    />
                    <text
                      x="0"
                      y="5"
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="900"
                      fill="#ffffff"
                    >
                      {isShield ? '🛡️' : '💥'}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* BOTTOM INTERACTIVE REGION DETAILS BAR */}
      <div className="w-full shrink-0 border-t border-stone-800/90 bg-stone-950/90 px-3 py-1.5 backdrop-blur-md">
        {activeTerritory ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="font-serif font-bold text-stone-100 truncate">
                {activeTerritory.isBase ? '🏰 ' : ''}
                {activeTerritory.name}
              </span>
              <span className="text-[10px] font-mono text-amber-400/80 hidden sm:inline shrink-0">
                ({activeTerritory.region})
              </span>
              {activeTerritory.counties && activeTerritory.counties.length > 1 && (
                <span className="text-[10px] text-stone-400 hidden md:inline truncate max-w-[320px]">
                  Format din: {activeTerritory.counties.join(', ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {activeOwner ? (
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeOwner.color }}
                  />
                  <span className="font-bold text-stone-100" style={{ color: activeOwner.color }}>
                    {activeOwner.username}
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300 tabular-nums">
                    <Award className="h-3 w-3" />
                    {(activeTerritory.points || 0) + (activeTerritory.defensiveBonus || 0)} pct
                  </span>
                </div>
              ) : (
                <span className="text-stone-400 italic text-[11px]">Teritoriu Neutru</span>
              )}

              <span className="text-[11px] font-semibold">
                {isMyTurn && currentUserPlayer ? (
                  canTargetTerritory(
                    activeTerritory.id,
                    currentUserPlayer,
                    territories,
                    gamePhase as any,
                    assignedDefenderId
                  ).allowed ? (
                    <span className="text-emerald-400 font-bold">
                      &bull; Apasă pentru acțiune
                    </span>
                  ) : (
                    <span className="text-stone-500">
                      &bull;{' '}
                      {canTargetTerritory(
                        activeTerritory.id,
                        currentUserPlayer,
                        territories,
                        gamePhase as any,
                        assignedDefenderId
                      ).reason || 'Neeligibil'}
                    </span>
                  )
                ) : null}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] text-stone-400">
            <span>
              Atinge sau plasează cursorul pe orice teritoriu pentru detalii complete.
            </span>
            {zoom > 1 && (
              <span className="font-mono text-amber-300">Zoom: {Math.round(zoom * 100)}%</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
