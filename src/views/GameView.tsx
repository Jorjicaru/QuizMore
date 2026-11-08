import React from 'react';
import { GameState, UserProfile } from '../types/game';
import { GameHUD } from '../components/GameHUD';
import { RomaniaMap } from '../components/RomaniaMap';
import { QuestionModal } from '../components/QuestionModal';
import { GameOverModal } from '../components/GameOverModal';

interface GameViewProps {
  game: GameState;
  currentUser: UserProfile;
  onSelectTerritory: (territoryId: string) => void;
  onSubmitAnswer: (answer: number | string) => void;
  onLeaveGame: () => void;
  onRematch: () => void;
}

export const GameView: React.FC<GameViewProps> = ({
  game,
  currentUser,
  onSelectTerritory,
  onSubmitAnswer,
  onLeaveGame,
  onRematch,
}) => {
  const activePlayer = game.players[game.activePlayerIndex];

  return (
    <div className="relative w-full h-full flex flex-col min-h-0 gap-1.5 sm:gap-2.5 overflow-hidden animate-fadeIn">
      {/* Top HUD with scores, turn status & round */}
      <GameHUD
        game={game}
        currentUserId={currentUser.id}
        onLeaveGame={onLeaveGame}
      />

      {/* Main Romania Map (flex-1 fills available vertical space without scroll) */}
      <RomaniaMap
        territories={game.territories}
        players={game.players}
        activePlayerId={activePlayer?.id}
        currentUserId={currentUser.id}
        gamePhase={game.phase}
        selectedTerritoryId={game.currentQuestion?.targetTerritoryId || game.pendingTerritoryId}
        onSelectTerritory={onSelectTerritory}
        disabled={game.currentQuestion !== null}
      />

      {/* Active Question Modal */}
      {game.currentQuestion && (
        <QuestionModal
          activeQuestion={game.currentQuestion}
          players={game.players}
          currentUserId={currentUser.id}
          onSubmitAnswer={onSubmitAnswer}
        />
      )}

      {/* Game Over Screen */}
      {game.phase === 'finished' && (
        <GameOverModal
          game={game}
          currentUserId={currentUser.id}
          onRematch={onRematch}
          onGoHome={onLeaveGame}
        />
      )}
    </div>
  );
};
