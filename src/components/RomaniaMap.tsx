import React, { useState } from 'react';
import { Territory, Player, GamePhase } from '../types/game';
import { canTargetTerritory, canSelectBase } from '../game/rules';
import { sound } from '../services/audio';
import { Shield, Castle, Crosshair, Award, AlertCircle } from 'lucide-react';

interface RomaniaMapProps {
  territories: Record<string, Territory>;
  players: Player[];
  activePlayerId?: string;
  currentUserId?: string;
  gamePhase: GamePhase;
  selectedTerritoryId?: string | null;
  onSelectTerritory: (territoryId: string) => void;
  disabled?: boolean;
}

export const RomaniaMap: React.FC<RomaniaMapProps> = ({
  territories,
  players,
  activePlayerId,
  currentUserId,
  gamePhase,
  selectedTerritoryId,
  onSelectTerritory,
  disabled = false,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const targetedId = selectedTerritoryId || null;
  const isMyTurn = currentUserId !== undefined && activePlayerId === currentUserId && !disabled;
  const activePlayer = players.find(p => p.id === activePlayerId);

  // Helper to find player owning a territory
  const getOwner = (ownerId: string | null): Player | undefined => {
    if (!ownerId) return undefined;
    return players.find(p => p.id === ownerId);
  };

  const currentUserPlayer = players.find(p => p.id === currentUserId);

  const handleTerritoryClick = (t: Territory) => {
    if (!isMyTurn || disabled || !currentUserPlayer) return;

    const check = canTargetTerritory(t.id, currentUserPlayer, territories, gamePhase as any);
    if (!check.allowed) {
      sound.playWrong();
      return;
    }

    sound.playClick();
    onSelectTerritory(t.id);
  };

  const territoryList = Object.values(territories);
  const hoveredTerritory = hoveredId ? territories[hoveredId] : null;
  const hoveredOwner = hoveredTerritory ? getOwner(hoveredTerritory.ownerId) : null;

  return (
    <div
      className="relative flex-1 min-h-0 w-full overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-stone-800/90 p-1 sm:p-2 shadow-2xl select-none flex flex-col items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse at 50% 45%, #4a2d18 0%, #2e1a0d 45%, #180d06 90%, #0d0703 100%)',
        boxShadow: 'inset 0 0 60px rgba(0, 0, 0, 0.9), 0 10px 30px rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* Map Header Status & Mode (subtle compact overlay) */}
      <div className="pointer-events-none absolute top-2 left-3 right-3 z-10 flex items-center justify-between">
        <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-stone-950/80 px-2.5 py-1 text-[11px] shadow-lg backdrop-blur-md">
          <Crosshair className="h-3.5 w-3.5 text-amber-400 animate-spin-slow" />
          <span className="font-serif font-bold tracking-wider text-amber-200">
            Harta României &bull; {territoryList.length} Zone
          </span>
        </div>

        {isMyTurn && (
          <div className="flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-500/20 px-3 py-1 shadow-[0_0_15px_rgba(245,158,11,0.5)] backdrop-blur-md animate-pulse">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            <span className="text-[11px] font-serif font-black tracking-wide text-amber-200">
              {gamePhase === 'base_selection'
                ? 'ALEGE BAZA TA (1000 PCT)'
                : gamePhase === 'conquest'
                ? 'CUCEREȘTE O ZONĂ VECINĂ (200 PCT)'
                : gamePhase === 'allocation'
                ? 'ALEGE TERITORIU (300 PCT)'
                : 'ATACĂ UN TERITORIU INAMIC (400 PCT)'}
            </span>
          </div>
        )}
      </div>

      {/* SVG Canvas for Romania Map (fits 100% available space with object-contain) */}
      <div className="w-full h-full flex-1 min-h-0 flex items-center justify-center p-0.5 sm:p-2">
        <svg
          viewBox="0 0 960 660"
          className="w-full h-full max-h-full object-contain filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.95)]"
        >
          <defs>
            {/* Diamond / Crosshatch Pattern - Matches image_b5a87907.png */}
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

            {/* Hatch pattern for current selection preview */}
            <pattern
              id="selected-hatch"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <line x1="0" y1="0" x2="0" y2="14" stroke="#38bdf8" strokeWidth="2.5" strokeOpacity="0.4" />
            </pattern>

            {/* 3D Arrow Filter */}
            <filter id="arrow-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0284c7" floodOpacity="0.8" />
            </filter>

            {/* Territory Relief Border Effect */}
            <filter id="border-relief" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Render All Map Territories */}
          {territoryList.map((t) => {
            const owner = getOwner(t.ownerId);
            const isHovered = hoveredId === t.id;
            const isSelected = targetedId === t.id;

            // Check if actionable by current user
            let isActionable = false;
            let isForbiddenBase = false;

            if (isMyTurn && currentUserPlayer) {
              const check = canTargetTerritory(t.id, currentUserPlayer, territories, gamePhase as any);
              isActionable = check.allowed;

              if (gamePhase === 'base_selection' && t.ownerId === null && !canSelectBase(t.id, territories)) {
                isForbiddenBase = true;
              }
            }

            // Fill color
            let fillColor = '#d5c4a1'; // Unclaimed territory base warm parchment
            let fillOpacity = 0.88;

            if (owner) {
              fillColor = owner.color;
              fillOpacity = 0.92;
            } else if (isForbiddenBase) {
              fillColor = '#78716c';
              fillOpacity = 0.5;
            }

            // Outer boundary relief stroke
            const strokeColor = isSelected
              ? '#38bdf8'
              : isActionable
              ? '#fbbf24'
              : owner
              ? '#fef08a'
              : '#92734a';

            const strokeWidth = isSelected ? 4 : isActionable ? 3 : owner ? 2.5 : 2;
            const isPath = t.svgPath.startsWith('M');

            return (
              <g
                key={t.id}
                className={`transition-all duration-150 ${
                  isActionable ? 'cursor-pointer hover:filter-brightness-110' : 'cursor-default'
                }`}
                onMouseEnter={() => setHoveredId(t.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleTerritoryClick(t)}
              >
                {/* 1. Base Polygon or Path */}
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
                    className={isSelected ? 'animate-pulse' : ''}
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
                    className={isSelected ? 'animate-pulse' : ''}
                  />
                )}

                {/* 2. Diamond Texture Overlay for Owned Territories (from image_b5a87907.png) */}
                {owner && (
                  isPath ? (
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
                  )
                )}

                {/* 3. Cross-hatch Overlay if selected */}
                {isSelected && (
                  isPath ? (
                    <path
                      d={t.svgPath}
                      fill="url(#selected-hatch)"
                      stroke="none"
                      className="pointer-events-none animate-pulse"
                    />
                  ) : (
                    <polygon
                      points={t.svgPath}
                      fill="url(#selected-hatch)"
                      stroke="none"
                      className="pointer-events-none animate-pulse"
                    />
                  )
                )}

                {/* 4. Center Indicators: Base Medallion or Points */}
                <g transform={`translate(${t.labelX}, ${t.labelY})`} className="pointer-events-none">
                  {/* BASE CASTLE MEDALLION - Matches Conquiztador layout with 3 Castle Towers */}
                  {t.isBase && owner ? (
                    <g transform="translate(0, 0)">
                      {/* Name Plate above Medallion */}
                      <g transform="translate(0, -26)">
                        <rect
                          x={-Math.max(32, owner.username.length * 4.2)}
                          y="-10"
                          width={Math.max(64, owner.username.length * 8.4)}
                          height="16"
                          rx="4"
                          fill="#1c1109"
                          fillOpacity="0.9"
                          stroke="#eab308"
                          strokeWidth="1.2"
                        />
                        <text
                          x="0"
                          y="2"
                          textAnchor="middle"
                          fontSize="9.5"
                          fontWeight="800"
                          fill="#fef08a"
                          fontFamily="sans-serif"
                        >
                          {owner.username}
                        </text>
                      </g>

                      {/* Golden Circular Medallion */}
                      <circle
                        cx="0"
                        cy="2"
                        r="16"
                        fill={owner.color}
                        stroke="#fef08a"
                        strokeWidth="2.5"
                        filter="drop-shadow(0 2px 5px rgba(0,0,0,0.8))"
                      />
                      <circle
                        cx="0"
                        cy="2"
                        r="13"
                        fill="none"
                        stroke="#b45309"
                        strokeWidth="1.5"
                      />
                      {/* Crest / Knight Helmet Icon inside Medallion */}
                      <text
                        x="0"
                        y="8"
                        textAnchor="middle"
                        fontSize="14"
                        fill="#fef08a"
                        fontWeight="bold"
                      >
                        ♞
                      </text>

                      {/* 3 Castle Towers Indicators (Turnurile Cetății) */}
                      <g transform="translate(0, 24)">
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
                                strokeWidth="0.8"
                              />
                              {/* Tower Battlements */}
                              <rect x="-3.5" y="-7" width="2" height="2" fill={intact ? '#fef08a' : '#71717a'} />
                              <rect x="1.5" y="-7" width="2" height="2" fill={intact ? '#fef08a' : '#71717a'} />
                            </g>
                          );
                        })}
                      </g>

                      {/* Base Score 1000 */}
                      <text
                        x="0"
                        y="39"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="900"
                        fill="#1c1109"
                        fontFamily="Georgia, serif"
                      >
                        1000
                      </text>
                    </g>
                  ) : owner ? (
                    /* OWNED REGULAR TERRITORY SCORE (200, 300, 400) + DEFENSIVE BONUS IF APPLICABLE */
                    <g transform="translate(0, 0)">
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontSize="12.5"
                        fontWeight="900"
                        fill="#1c1109"
                        fontFamily="Georgia, serif"
                        filter="drop-shadow(0 1px 1px rgba(255,255,255,0.4))"
                      >
                        {t.points || 200}
                      </text>
                      {/* Defensive Bonus Badge */}
                      {!!t.defensiveBonus && (
                        <g transform="translate(14, -8)">
                          <circle cx="0" cy="0" r="7" fill="#059669" stroke="#34d399" strokeWidth="1" />
                          <text x="0" y="3" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#ffffff">
                            +100
                          </text>
                        </g>
                      )}
                    </g>
                  ) : (
                    /* Neutral territories never show point values, including while selected. */
                    null
                  )}

                  {/* Forbidden Base Indicator */}
                  {isForbiddenBase && (
                    <g transform="translate(0, 0)">
                      <circle cx="0" cy="0" r="10" fill="#dc2626" fillOpacity="0.8" />
                      <line x1="-5" y1="-5" x2="5" y2="5" stroke="#ffffff" strokeWidth="2" />
                    </g>
                  )}
                </g>

                {/* 5. 3D BLUE DOWNWARD POINTER ARROW OVER SELECTED TERRITORY (Faithfully matching image_b5a87907.png) */}
                {isSelected && (
                  <g
                    transform={`translate(${t.labelX}, ${t.labelY - 32})`}
                    className="pointer-events-none animate-bounce"
                    filter="url(#arrow-glow)"
                  >
                    {/* 3D Arrow Shaft */}
                    <rect x="-6" y="-36" width="12" height="22" fill="#0284c7" stroke="#38bdf8" strokeWidth="1.5" rx="2" />
                    {/* 3D Arrow Head */}
                    <polygon
                      points="0,0 -16,-16 -6,-16 -6,-36 6,-36 6,-16 16,-16"
                      fill="#0284c7"
                      stroke="#e0f2fe"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    {/* Arrow 3D light reflection */}
                    <polygon
                      points="0,-2 -12,-15 -4,-15 -4,-34 0,-34"
                      fill="#38bdf8"
                      opacity="0.6"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating Hover Tooltip / Status Information Card */}
      {hoveredTerritory && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-xs rounded-2xl border border-stone-700 bg-stone-950/95 p-3.5 shadow-2xl backdrop-blur-xl text-left animate-fadeIn">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2 mb-2">
            <div>
              <h4 className="font-serif font-bold text-sm text-stone-100 flex items-center gap-1.5">
                {hoveredTerritory.isBase && <span title="Bază Principală">🏰</span>}
                {hoveredTerritory.name}
              </h4>
              <span className="text-[11px] text-amber-400/80 font-mono">{hoveredTerritory.region}</span>
            </div>
            {hoveredOwner && (
              <div className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30">
                <Award className="h-3.5 w-3.5" />
                {hoveredTerritory.points} pct
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-stone-300">
              <span className="text-stone-400">Stăpânit de:</span>
              {hoveredOwner ? (
                <span className="font-bold flex items-center gap-1.5" style={{ color: hoveredOwner.color }}>
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hoveredOwner.color }} />
                  {hoveredOwner.username} {hoveredTerritory.isBase ? '(Castelul Bază)' : ''}
                </span>
              ) : (
                <span className="text-stone-500 italic">Teritoriu Liber (Neutru)</span>
              )}
            </div>

            <div className="pt-2 border-t border-stone-800 text-[11px] flex items-center justify-between">
              <span className="text-stone-400">Vecini: {hoveredTerritory.neighbors.length}</span>
              {isMyTurn && currentUserPlayer ? (
                canTargetTerritory(hoveredTerritory.id, currentUserPlayer, territories, gamePhase as any).allowed ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <Crosshair className="h-3 w-3" /> CLICK PENTRU ACȚIUNE
                  </span>
                ) : (
                  <span className="text-stone-600">Acțiune nepermisă</span>
                )
              ) : (
                <span className="text-stone-600">Nu e rândul tău</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
