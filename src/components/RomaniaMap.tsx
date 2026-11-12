import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Territory, Player, GamePhase, WarRoundState, GameState } from '../types/game';
import { canTargetTerritory, canSelectBase } from '../game/rules';
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

  // Zoom & Pan state (Initial state is Fit to Screen: zoom = 1, pan = 0,0)
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const didDragRef = useRef<boolean>(false);
  const mapWrapperRef = useRef<HTMLDivElement>(null);

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
            myWarBattle.targetTerritoryId === null
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

  const getOwner = (ownerId: string | null): Player | undefined => {
    if (!ownerId) return undefined;
    return players.find((p) => p.id === ownerId);
  };

  const handleTerritoryClick = (t: Territory) => {
    if (didDragRef.current) {
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

  const handleZoomIn = () => {
    setZoom((prev) => {
      const next = Math.min(2.5, Number((prev + 0.4).toFixed(2)));
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
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
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
    if (!isDragging || !dragStartRef.current || zoom <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > 6) {
      didDragRef.current = true;
    }
    const scaleFactor = (960 / zoom) / Math.max(320, containerWidth);
    const nextPan = clampPan(
      dragStartRef.current.panX - dx * scaleFactor,
      dragStartRef.current.panY - dy * scaleFactor,
      zoom
    );
    setPan(nextPan);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
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
      <div className="pointer-events-none absolute top-2 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2">
        <div
          data-testid="map-preset-badge"
          className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-stone-950/85 px-2.5 py-1 text-[10px] sm:text-[11px] shadow-lg backdrop-blur-md"
        >
          <Crosshair className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-400 shrink-0" />
          <span className="font-serif font-bold tracking-wider text-amber-200 whitespace-nowrap">
            Harta României &bull; {effectivePlayerPreset} Jucători &bull; {territoryList.length} Teritorii
          </span>
        </div>

        {isMyTurn && (
          <div className="flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-500/25 px-2.5 py-1 shadow-[0_0_15px_rgba(245,158,11,0.5)] backdrop-blur-md">
            <span className="text-[10px] sm:text-[11px] font-serif font-black tracking-wide text-amber-200 whitespace-nowrap">
              {gamePhase === 'base_selection'
                ? 'ALEGE BAZA TA (1000 PCT)'
                : gamePhase === 'conquest'
                ? 'CUCEREȘTE ZONĂ ÎNVECINATĂ (200 PCT)'
                : gamePhase === 'allocation'
                ? 'ALEGE TERITORIU VECIN (300 PCT)'
                : 'ATACĂ ȚINTA INAMICĂ (400 PCT)'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom-Left Controls: Zoom & Fit-to-Screen + Discrete County Lines Toggle */}
      <div className="absolute bottom-10 left-2.5 z-20 flex items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/85 p-1 shadow-xl backdrop-blur-md">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Mărește Harta (Zoom In)"
          aria-label="Zoom In"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-amber-300 hover:bg-stone-800 active:scale-95 transition"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= 1}
          title="Micșorează Harta (Zoom Out)"
          aria-label="Zoom Out"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-stone-300 hover:bg-stone-800 disabled:opacity-40 active:scale-95 transition"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        {zoom > 1 && (
          <button
            type="button"
            onClick={handleResetZoom}
            title="Încadrează toată harta (Fit to Screen)"
            aria-label="Reset Zoom"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 active:scale-95 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowInternalCounties((prev) => !prev)}
          title={
            showInternalCounties
              ? 'Ascunde conturul județelor componente'
              : 'Afișează conturul județelor componente'
          }
          data-testid="toggle-county-lines"
          className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold transition ${
            showInternalCounties
              ? 'bg-stone-900 text-stone-300 hover:bg-stone-800'
              : 'bg-stone-900/50 text-stone-500 hover:bg-stone-800/70'
          }`}
        >
          <Layers className="h-3 w-3 text-amber-400/80" />
          <span className="hidden sm:inline">Județe</span>
        </button>
      </div>

      {/* Bottom-Right Compact Round Tracker Overlay (Section 46 & 49 of TODO V5.0) */}
      {game && (
        <div className="pointer-events-none absolute bottom-10 right-2.5 z-20">
          <RoundTracker game={game} />
        </div>
      )}

      {/* SVG Canvas Container */}
      <div className="w-full flex-1 min-h-0 flex items-center justify-center p-1 sm:p-2 overflow-hidden">
        <svg
          data-testid="romania-map-svg"
          viewBox={viewBoxStr}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
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

            <filter id="arrow-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0284c7" floodOpacity="0.8" />
            </filter>

            <filter id="border-relief" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* ============================================================
              LAYER 1: DISSOLVED TERRITORY EXTERIOR POLYGONS & TEXTURES
          ============================================================ */}
          <g id="layer-territories">
            {territoryList.map((t) => {
              const owner = getOwner(t.ownerId);
              const warTargetEntry = warTargetedByTerritoryId.get(t.id);
              const isSelected = targetedId === t.id || Boolean(warTargetEntry);
              const isInspected = inspectedId === t.id;

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

              let fillColor = '#d5c4a1';
              let fillOpacity = 0.88;

              if (owner) {
                fillColor = owner.color;
                fillOpacity =
                  isMyTurn && !isActionable && t.ownerId !== currentUserId ? 0.62 : 0.92;
              } else if (isForbiddenBase) {
                fillColor = '#78716c';
                fillOpacity = 0.5;
              } else if (isMyTurn && !isActionable) {
                fillColor = '#9ca3af';
                fillOpacity = 0.45;
              }

              const isAttackPreviewTarget =
                gamePhase === 'war' &&
                warRound?.status === 'attack_preview' &&
                Boolean(warTargetEntry);

              const isHovered = hoveredId === t.id;
              const strokeColor = isAttackPreviewTarget
                ? '#f43f5e'
                : isSelected
                ? '#38bdf8'
                : isInspected || isHovered
                ? '#f59e0b'
                : isActionable
                ? '#fbbf24'
                : owner
                ? '#fef08a'
                : '#6b4c28';

              const strokeWidth = isAttackPreviewTarget
                ? 4.5
                : isSelected
                ? 4.0
                : isInspected || isHovered
                ? 3.2
                : isActionable
                ? 2.9
                : owner
                ? 2.4
                : 2.1;
              const isPath = t.svgPath.startsWith('M');

              return (
                <g
                  key={t.id}
                  data-testid={`territory-${t.id}`}
                  data-owner={t.ownerId || 'neutral'}
                  data-actionable={isActionable ? 'true' : 'false'}
                  className={`transition-opacity duration-150 motion-reduce:transition-none ${
                    isActionable
                      ? 'cursor-pointer hover:brightness-110'
                      : isMyTurn
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                  onMouseEnter={() => setHoveredId(t.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleTerritoryClick(t)}
                >
                  {isPath ? (
                    <path
                      d={t.svgPath}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeDasharray={isSelected ? '6 4' : undefined}
                      filter="url(#border-relief)"
                    />
                  ) : (
                    <polygon
                      points={t.svgPath}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeDasharray={isSelected ? '6 4' : undefined}
                      filter="url(#border-relief)"
                    />
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
              LAYER 3: CASTLE MEDALLIONS, TOWERS, 1000 SCORES,
                       COLLISION-FREE NAMEPLATES & SIMULTANEOUS ATTACK ARROWS
          ============================================================ */}
          <g id="layer-castles" className="pointer-events-none">
            {territoryList.map((t) => {
              const owner = getOwner(t.ownerId);
              if (!t.isBase || !owner) return null;

              const placement = baseLabelPlacements[t.id];

              return (
                <g key={`castle_${t.id}`}>
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
                      cy="2"
                      r="16"
                      fill={owner.color}
                      stroke="#fef08a"
                      strokeWidth="2.5"
                      filter="drop-shadow(0 2px 5px rgba(0,0,0,0.85))"
                    />
                    <circle
                      cx="0"
                      cy="2"
                      r="13"
                      fill="none"
                      stroke="#b45309"
                      strokeWidth="1.5"
                    />
                    <text
                      x="0"
                      y="7.5"
                      textAnchor="middle"
                      fontSize="14"
                      fill="#fef08a"
                      fontWeight="bold"
                    >
                      ♞
                    </text>

                    <g transform="translate(0, 23)">
                      {[0, 1, 2].map((idx) => {
                        const intact = idx < (t.castleTowers ?? 3);
                        const posX = (idx - 1) * 9;
                        return (
                          <g key={idx} transform={`translate(${posX}, 0)`}>
                            <rect
                              x="-3.5"
                              y="-5"
                              width="7"
                              height="8"
                              rx="1.5"
                              fill={intact ? '#f59e0b' : '#3f3f46'}
                              stroke={intact ? '#fef08a' : '#18181b'}
                              strokeWidth="0.9"
                            />
                            <rect
                              x="-3.5"
                              y="-7"
                              width="2"
                              height="2"
                              fill={intact ? '#fef08a' : '#71717a'}
                            />
                            <rect
                              x="1.5"
                              y="-7"
                              width="2"
                              height="2"
                              fill={intact ? '#fef08a' : '#71717a'}
                            />
                          </g>
                        );
                      })}
                    </g>

                    <g transform="translate(0, 36)">
                      <rect
                        x="-18"
                        y="-7"
                        width="36"
                        height="13"
                        rx="4"
                        fill="#1c1109"
                        fillOpacity="0.88"
                        stroke="#eab308"
                        strokeWidth="0.9"
                      />
                      <text
                        x="0"
                        y="2.5"
                        textAnchor="middle"
                        fontSize="9.5"
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
