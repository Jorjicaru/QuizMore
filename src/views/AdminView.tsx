import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Question, QuestionCategory } from '../types/game';
import { sound } from '../services/audio';
import {
  ShieldAlert,
  Database,
  Users,
  PlusCircle,
  Trash2,
  Edit3,
  Search,
  Upload,
  Check,
  AlertCircle,
  Activity,
  FileText,
  RefreshCw,
  XCircle,
  Sliders,
} from 'lucide-react';

type AdminTabId = 'stats' | 'users' | 'questions' | 'audit';
type DifficultyOption = 'usor' | 'mediu' | 'greu';

function normalizeQuestionDifficulty(value: string | undefined): DifficultyOption {
  if (value === 'usor' || value === 'mediu' || value === 'greu') {
    return value;
  }
  return 'mediu';
}

export const AdminView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTabId>('stats');
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.getAdminStats>> | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Questions State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qSearch, setQSearch] = useState('');
  const [qCategory, setQCategory] = useState('');
  const [qDifficulty, setQDifficulty] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [confirmDeleteQuestionId, setConfirmDeleteQuestionId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');

  // Question Form State (Add & Edit)
  const [newType, setNewType] = useState<'choice' | 'estimation'>('choice');
  const [newCategory, setNewCategory] = useState<QuestionCategory>('istorie');
  const [newDifficulty, setNewDifficulty] = useState<DifficultyOption>('mediu');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newOptions, setNewOptions] = useState<string[]>(['', '', '', '']);
  const [newCorrectIndex, setNewCorrectIndex] = useState<number>(0);
  const [newTargetNumber, setNewTargetNumber] = useState<string>('');
  const [newUnit, setNewUnit] = useState<string>('');
  const [newExplanation, setNewExplanation] = useState<string>('');

  // Users State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [adjustingUser, setAdjustingUser] = useState<any | null>(null);
  const [adjustForm, setAdjustForm] = useState<{
    rating: string;
    wins: string;
    losses: string;
    matchesPlayed: string;
    highestScore: string;
    title: string;
    reason: string;
  }>({
    rating: '1000',
    wins: '0',
    losses: '0',
    matchesPlayed: '0',
    highestScore: '0',
    title: '',
    reason: '',
  });
  const [confirmUserAction, setConfirmUserAction] = useState<{
    userId: string;
    username: string;
    action: 'ban' | 'role';
    targetRole?: 'user' | 'admin';
  } | null>(null);

  // Room close confirmation state
  const [confirmCloseRoom, setConfirmCloseRoom] = useState<{ roomId: string; roomName: string } | null>(null);
  const [closeRoomReason, setCloseRoomReason] = useState('');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchQuestions = async () => {
    try {
      const res = await api.getQuestions({
        search: qSearch || undefined,
        category: qCategory || undefined,
        difficulty: qDifficulty || undefined,
      });
      setQuestions(res.questions || []);
    } catch {
      // ignore
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.getAdminUsers(userSearch);
      setUsersList(res.users || []);
    } catch {
      // ignore
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.getAdminStats();
      setStats(res);
    } catch {
      // ignore
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await api.getAdminAuditLogs(100);
      setAuditLogs(res.logs || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStats();
    if (activeTab === 'questions') fetchQuestions();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab, qCategory, qDifficulty]);

  const openAddQuestionModal = () => {
    setEditingQuestion(null);
    setNewType('choice');
    setNewCategory('istorie');
    setNewDifficulty('mediu');
    setNewQuestionText('');
    setNewOptions(['', '', '', '']);
    setNewCorrectIndex(0);
    setNewTargetNumber('');
    setNewUnit('');
    setNewExplanation('');
    setShowAddModal(true);
  };

  const openEditQuestionModal = (q: Question) => {
    setEditingQuestion(q);
    setNewType(q.type);
    setNewCategory(q.category);
    setNewDifficulty(normalizeQuestionDifficulty(q.difficulty));
    setNewQuestionText(q.question);
    setNewOptions(q.options && q.options.length === 4 ? [...q.options] : ['', '', '', '']);
    setNewCorrectIndex(q.correctAnswerIndex ?? 0);
    setNewTargetNumber(q.targetNumber !== undefined ? String(q.targetNumber) : '');
    setNewUnit(q.unit || '');
    setNewExplanation(q.explanation || '');
    setShowAddModal(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      sound.playClick();
      const payload = {
        type: newType,
        category: newCategory,
        difficulty: newDifficulty,
        question: newQuestionText,
        options: newType === 'choice' ? newOptions : undefined,
        correctAnswerIndex: newType === 'choice' ? newCorrectIndex : undefined,
        targetNumber: newType === 'estimation' ? Number(newTargetNumber) : undefined,
        unit: newType === 'estimation' ? newUnit : undefined,
        explanation: newExplanation,
      };
      if (editingQuestion) {
        await api.updateQuestion(editingQuestion.id, payload);
        setMessage({ text: 'Întrebarea a fost actualizată și auditată cu succes!', type: 'success' });
      } else {
        await api.createQuestion(payload);
        setMessage({ text: 'Întrebarea a fost salvată cu succes în baza de date!', type: 'success' });
      }
      setShowAddModal(false);
      setEditingQuestion(null);
      fetchQuestions();
      fetchStats();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      sound.playClick();
      await api.deleteQuestion(id);
      setMessage({ text: 'Întrebarea a fost ștearsă și înregistrată în jurnalul de audit.', type: 'success' });
      setConfirmDeleteQuestionId(null);
      fetchQuestions();
      fetchStats();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleImport = async () => {
    try {
      sound.playClick();
      const parsed = JSON.parse(importJson);
      const res = await api.importQuestions(Array.isArray(parsed) ? parsed : [parsed]);
      setMessage({ text: res.message, type: 'success' });
      setShowImportModal(false);
      setImportJson('');
      fetchQuestions();
      fetchStats();
    } catch (err: any) {
      setMessage({ text: `Eroare format JSON: ${err.message}`, type: 'error' });
    }
  };

  const executeConfirmedUserAction = async () => {
    if (!confirmUserAction) return;
    try {
      sound.playClick();
      if (confirmUserAction.action === 'ban') {
        const res = await api.toggleUserBan(confirmUserAction.userId);
        setMessage({ text: res.message, type: 'success' });
      } else if (confirmUserAction.action === 'role' && confirmUserAction.targetRole) {
        const res = await api.setRole(confirmUserAction.userId, confirmUserAction.targetRole);
        setMessage({ text: res.message, type: 'success' });
      }
      setConfirmUserAction(null);
      fetchUsers();
      fetchStats();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const openAdjustModal = (user: any) => {
    setAdjustingUser(user);
    setAdjustForm({
      rating: String(user.rating ?? 1000),
      wins: String(user.wins ?? 0),
      losses: String(user.losses ?? 0),
      matchesPlayed: String(user.matchesPlayed ?? 0),
      highestScore: String(user.highestScore ?? 0),
      title: String(user.title ?? 'Explorator'),
      reason: '',
    });
  };

  const handleAdjustStatsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingUser) return;
    try {
      sound.playClick();
      const res = await api.adjustUserStats(adjustingUser.id, {
        rating: Number(adjustForm.rating),
        wins: Number(adjustForm.wins),
        losses: Number(adjustForm.losses),
        matchesPlayed: Number(adjustForm.matchesPlayed),
        highestScore: Number(adjustForm.highestScore),
        title: adjustForm.title.trim(),
        reason: adjustForm.reason.trim() || 'Corecție manuală din panoul de administrare',
      });
      setMessage({ text: res.message, type: 'success' });
      setAdjustingUser(null);
      fetchUsers();
      fetchStats();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleConfirmCloseRoom = async () => {
    if (!confirmCloseRoom) return;
    try {
      sound.playClick();
      const res = await api.closeAdminRoom(
        confirmCloseRoom.roomId,
        closeRoomReason.trim() || 'Cameră închisă de administrator'
      );
      setMessage({ text: res.message, type: 'success' });
      setConfirmCloseRoom(null);
      setCloseRoomReason('');
      fetchStats();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const tabs: Array<{ id: AdminTabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'stats', label: 'Statistici Live & Camere', icon: Activity },
    { id: 'users', label: 'Utilizatori & Clasament', icon: Users },
    { id: 'questions', label: 'Baza de Întrebări', icon: Database },
    { id: 'audit', label: 'Jurnal Audit Admin', icon: FileText },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fadeIn text-left" data-testid="admin-view">
      {/* Admin Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-purple-500/40 bg-gradient-to-r from-slate-900 via-slate-950 to-purple-950/30 p-6 shadow-2xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400">
            <ShieldAlert className="h-4 w-4" /> Panou de Administrare & Control CONQUIZ
          </div>
          <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-black text-slate-100">
            Statistici Live, Moderare & Gestiune
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitorizează camerele active, utilizatorii autentificați, clasamentul, întrebările și jurnalul de audit.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              sound.playClick();
              fetchStats();
              if (activeTab === 'users') fetchUsers();
              if (activeTab === 'questions') fetchQuestions();
              if (activeTab === 'audit') fetchAuditLogs();
            }}
            className="flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/15 px-3.5 py-2 text-xs font-bold text-purple-200 hover:bg-purple-500/25 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualizează Datele
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border p-3.5 text-xs font-semibold ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={`admin-tab-${tab.id}`}
              onClick={() => {
                sound.playClick();
                setActiveTab(tab.id);
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                isActive
                  ? 'border border-purple-500/40 bg-purple-500/20 text-purple-300'
                  : 'border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Live Statistics & Active Rooms */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-6" data-testid="admin-stats-panel">
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] font-bold uppercase text-slate-400">Camere Active (În Joc)</div>
              <div className="mt-1 font-mono text-2xl font-black text-emerald-400" data-testid="stat-active-rooms">
                {stats.activeRoomsCount ?? 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                În așteptare: {stats.waitingRoomsCount ?? 0} • Finalizate: {stats.finishedRoomsCount ?? 0}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] font-bold uppercase text-slate-400">Utilizatori Online</div>
              <div className="mt-1 font-mono text-2xl font-black text-sky-400" data-testid="stat-online-users">
                {stats.onlineAuthenticatedCount ?? 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Conexiuni Socket: {stats.activeSocketsCount ?? 0} • Total conturi: {stats.totalUsers ?? 0}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] font-bold uppercase text-slate-400">Deconectați / Bot Temp.</div>
              <div className="mt-1 font-mono text-2xl font-black text-amber-400" data-testid="stat-bot-controlled">
                {stats.disconnectedPlayersCount ?? 0} / {stats.botControlledPlayersCount ?? 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Jucători deconectați / preluați de bot
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] font-bold uppercase text-slate-400">Întrebări Aprobate</div>
              <div className="mt-1 font-mono text-2xl font-black text-purple-300" data-testid="stat-approved-questions">
                {stats.approvedQuestions ?? stats.totalQuestions ?? 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Partide istorice salvate: {stats.totalGames ?? 0}
              </div>
            </div>
          </div>

          {/* Service Health & Recent Errors */}
          {stats.health && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Starea Serviciului & Infrastructură
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Mod Stocare</span>
                    <span className="font-mono font-bold text-slate-200 uppercase">
                      {stats.health.storageMode} ({stats.health.postgresConnected ? 'PostgreSQL Activ' : 'Fallback JSON'})
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Uptime Server</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {Math.floor((stats.health.uptimeSeconds || 0) / 60)} min ({stats.health.uptimeSeconds}s)
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Serviciu Email Reset</span>
                    <span className="font-mono font-bold text-slate-200">
                      {stats.health.emailConfigured ? 'SMTP Configurat' : 'Mod Dezvoltare'}
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Mod Mentenanță</span>
                    <span className={`font-mono font-bold ${stats.health.maintenanceMode ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {stats.health.maintenanceMode ? 'ACTIV' : 'INACTIV'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Erori Recente Server (Fără Secrete)
                </h3>
                {(!stats.health.recentErrors || stats.health.recentErrors.length === 0) ? (
                  <div className="rounded-lg border border-slate-800/80 bg-slate-950 p-4 text-xs text-emerald-400 font-medium">
                    Nu există erori recente înregistrate pe server.
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {stats.health.recentErrors.map((err) => (
                      <div key={err.id} className="rounded-lg border border-red-500/20 bg-slate-950 p-2 text-[11px]">
                        <div className="flex justify-between text-slate-400 font-mono text-[10px]">
                          <span className="text-red-300 font-bold">{err.source}</span>
                          <span>{new Date(err.timestamp).toLocaleTimeString('ro-RO')}</span>
                        </div>
                        <div className="text-slate-200 truncate" title={err.message}>
                          {err.message}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rooms Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Camere și Meciuri în Memorie ({(stats.rooms || []).length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3 pl-4">Cod Cameră</th>
                    <th className="p-3">Nume</th>
                    <th className="p-3">Fază</th>
                    <th className="p-3">Jucători</th>
                    <th className="p-3">Deconectați / Bot Temp.</th>
                    <th className="p-3 text-right pr-4">Acțiuni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(stats.rooms || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        Nicio cameră activă sau în așteptare în acest moment.
                      </td>
                    </tr>
                  ) : (
                    (stats.rooms || []).map((room) => (
                      <tr key={room.roomId} className="hover:bg-slate-800/40">
                        <td className="p-3 pl-4 font-mono font-bold text-amber-300">#{room.roomId}</td>
                        <td className="p-3 text-slate-200 font-semibold">{room.roomName}</td>
                        <td className="p-3">
                          <span className="rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-slate-800 text-slate-200">
                            {room.phase}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-300">
                          {room.playersCount}/{room.maxPlayers} (Umani: {room.humanPlayersCount}, Boți: {room.aiBotsCount})
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          {room.disconnectedHumansCount} deconectați / {room.botTakeoverCount} bot temp.
                        </td>
                        <td className="p-3 text-right pr-4">
                          {room.phase !== 'finished' && (
                            <button
                              onClick={() => {
                                setConfirmCloseRoom({ roomId: room.roomId, roomName: room.roomName });
                                setCloseRoomReason('');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/25"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Închide Camera
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Users & Leaderboard Management */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Caută utilizatori după nume sau email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            <button
              onClick={fetchUsers}
              className="rounded-xl bg-purple-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-500"
            >
              Caută
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3 pl-4">Utilizator</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Rol</th>
                    <th className="p-3 text-center">Rating</th>
                    <th className="p-3 text-center">V / Î / M</th>
                    <th className="p-3 text-center">Scor Max</th>
                    <th className="p-3 text-center">Stare</th>
                    <th className="p-3 text-right pr-4">Acțiuni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {usersList.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40">
                      <td className="p-3 pl-4 font-bold text-slate-100">
                        <div>{u.username}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{u.title}</div>
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{u.email}</td>
                      <td className="p-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            u.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-amber-300">{u.rating ?? 1000}</td>
                      <td className="p-3 text-center font-mono text-slate-300">
                        <span className="text-emerald-400">{u.wins ?? 0}</span> /{' '}
                        <span className="text-red-400">{u.losses ?? 0}</span> /{' '}
                        <span>{u.matchesPlayed ?? 0}</span>
                      </td>
                      <td className="p-3 text-center font-mono text-purple-300">{u.highestScore ?? 0}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            u.isBanned ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {u.isBanned ? 'Suspendat' : 'Activ'}
                        </span>
                      </td>
                      <td className="p-3 text-right pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openAdjustModal(u)}
                            className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/25"
                            title="Ajustează Clasament / Scor"
                          >
                            <Sliders className="h-3 w-3" /> Scor/Clasament
                          </button>

                          <button
                            onClick={() =>
                              setConfirmUserAction({
                                userId: u.id,
                                username: u.username,
                                action: 'role',
                                targetRole: u.role === 'admin' ? 'user' : 'admin',
                              })
                            }
                            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-700"
                          >
                            {u.role === 'admin' ? 'Fă User' : 'Fă Admin'}
                          </button>

                          <button
                            onClick={() =>
                              setConfirmUserAction({
                                userId: u.id,
                                username: u.username,
                                action: 'ban',
                              })
                            }
                            className={`rounded px-2 py-1 text-[10px] font-semibold ${
                              u.isBanned
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                            }`}
                          >
                            {u.isBanned ? 'Reactivează' : 'Suspendă'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Questions Management */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
              <input
                type="text"
                placeholder="Caută în textul întrebărilor..."
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchQuestions()}
                className="flex-1 min-w-[180px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />

              <select
                value={qCategory}
                onChange={(e) => setQCategory(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300"
              >
                <option value="">Toate Categoriile</option>
                <option value="istorie">Istorie</option>
                <option value="geografie">Geografie</option>
                <option value="biologie">Biologie</option>
                <option value="fizica">Fizică</option>
                <option value="chimie">Chimie</option>
                <option value="matematica">Matematică</option>
                <option value="literatura">Literatură</option>
                <option value="arta">Artă</option>
                <option value="sport">Sport</option>
                <option value="muzica">Muzică</option>
                <option value="cinematografie">Cinematografie</option>
                <option value="cultura_generala">Cultură Generală</option>
              </select>

              <select
                value={qDifficulty}
                onChange={(e) => setQDifficulty(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300"
              >
                <option value="">Toate Dificultățile</option>
                <option value="usor">Ușor</option>
                <option value="mediu">Mediu</option>
                <option value="greu">Greu</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                <Upload className="h-3.5 w-3.5" /> Import JSON
              </button>

              <button
                onClick={openAddQuestionModal}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-500 shadow-md shadow-purple-600/20"
              >
                <PlusCircle className="h-3.5 w-3.5" /> Adaugă Întrebare
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3 pl-4">Tip</th>
                    <th className="p-3">Categorie</th>
                    <th className="p-3">Dificultate</th>
                    <th className="p-3">Întrebare</th>
                    <th className="p-3">Răspuns Corect</th>
                    <th className="p-3 text-right pr-4">Acțiuni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {questions.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-800/40">
                      <td className="p-3 pl-4">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                            q.type === 'estimation'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {q.type === 'estimation' ? 'Estimare' : 'Alegere'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 capitalize">{q.category}</td>
                      <td className="p-3">
                        <span
                          className={`text-[11px] font-semibold ${
                            q.difficulty === 'greu'
                              ? 'text-red-400'
                              : q.difficulty === 'mediu'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      </td>
                      <td className="p-3 text-slate-200 font-medium max-w-xs truncate" title={q.question}>
                        {q.question}
                      </td>
                      <td className="p-3 text-slate-300 font-mono">
                        {q.type === 'choice' && q.options && q.correctAnswerIndex !== undefined ? (
                          <span className="text-emerald-400 font-semibold">{q.options[q.correctAnswerIndex]}</span>
                        ) : (
                          <span className="text-amber-400 font-bold">
                            {q.targetNumber} {q.unit}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditQuestionModal(q)}
                            className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition"
                            title="Editează"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          {confirmDeleteQuestionId === q.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white"
                              >
                                Confirmă
                              </button>
                              <button
                                onClick={() => setConfirmDeleteQuestionId(null)}
                                className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300"
                              >
                                Anulează
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteQuestionId(q.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                              title="Șterge"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Admin Audit Logs */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden" data-testid="admin-audit-panel">
          <div className="border-b border-slate-800 bg-slate-950 px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Jurnal Audit Operațiuni Admin ({auditLogs.length})
            </h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3 pl-4">Dată / Oră</th>
                  <th className="p-3">Administrator</th>
                  <th className="p-3">Acțiune</th>
                  <th className="p-3">Țintă</th>
                  <th className="p-3 pr-4">Detalii</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      Nicio acțiune administrativă înregistrată încă.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="p-3 pl-4 font-mono text-[11px] text-slate-400">
                        {new Date(log.createdAt).toLocaleString('ro-RO')}
                      </td>
                      <td className="p-3 font-bold text-purple-300">{log.adminUsername}</td>
                      <td className="p-3">
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-300">
                        {log.targetType}: {log.targetId}
                      </td>
                      <td className="p-3 pr-4 font-mono text-[10px] text-slate-400 max-w-md truncate">
                        {log.details ? JSON.stringify(log.details) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm User Ban / Role Change Modal */}
      {confirmUserAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-left">
            <h3 className="font-serif text-lg font-bold text-slate-100">Confirmare Acțiune Administrativă</h3>
            <p className="mt-2 text-xs text-slate-300">
              {confirmUserAction.action === 'ban'
                ? `Ești sigur că vrei să modifici starea de suspendare pentru contul „${confirmUserAction.username}”?`
                : `Ești sigur că vrei să schimbi rolul utilizatorului „${confirmUserAction.username}” în „${confirmUserAction.targetRole}”?`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmUserAction(null)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Anulează
              </button>
              <button
                onClick={executeConfirmedUserAction}
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500"
              >
                Confirmă Acțiunea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust User Leaderboard / Stats Modal */}
      {adjustingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-left">
            <h3 className="font-serif text-lg font-bold text-slate-100">
              Ajustare Clasament & Profil: {adjustingUser.username}
            </h3>
            <form onSubmit={handleAdjustStatsSubmit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Rating</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={adjustForm.rating}
                    onChange={(e) => setAdjustForm({ ...adjustForm, rating: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Scor Maxim</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={adjustForm.highestScore}
                    onChange={(e) => setAdjustForm({ ...adjustForm, highestScore: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Victorii</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={adjustForm.wins}
                    onChange={(e) => setAdjustForm({ ...adjustForm, wins: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Înfrângeri</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={adjustForm.losses}
                    onChange={(e) => setAdjustForm({ ...adjustForm, losses: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Meciuri Jucate</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={adjustForm.matchesPlayed}
                    onChange={(e) => setAdjustForm({ ...adjustForm, matchesPlayed: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Titlu</label>
                  <input
                    type="text"
                    required
                    value={adjustForm.title}
                    onChange={(e) => setAdjustForm({ ...adjustForm, title: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Motiv Audit (Opțional)</label>
                <input
                  type="text"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  placeholder="ex: Corecție scor după deconectare..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustingUser(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-slate-950 hover:bg-amber-400"
                >
                  Salvează & Auditează
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Room Close Modal */}
      {confirmCloseRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-left">
            <h3 className="font-serif text-lg font-bold text-slate-100">
              Închidere Forțată Cameră #{confirmCloseRoom.roomId}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Camera „{confirmCloseRoom.roomName}” va fi oprită imediat, iar jucătorii vor fi notificați.
            </p>
            <input
              type="text"
              value={closeRoomReason}
              onChange={(e) => setCloseRoomReason(e.target.value)}
              placeholder="Motiv închidere (ex: cameră blocată)..."
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-200"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmCloseRoom(null)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Anulează
              </button>
              <button
                onClick={handleConfirmCloseRoom}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500"
              >
                Confirmă Închiderea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Question Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-left max-h-[90vh] overflow-y-auto">
            <h3 className="font-serif text-xl font-bold text-slate-100 flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-purple-400" />
              {editingQuestion ? 'Editare Întrebare' : 'Adăugare Întrebare Nouă'}
            </h3>

            <form onSubmit={handleSaveQuestion} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Tip Întrebare</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200"
                  >
                    <option value="choice">Variantă Multiplă (4)</option>
                    <option value="estimation">Estimare Numerică</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Categorie</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200"
                  >
                    <option value="istorie">Istorie</option>
                    <option value="geografie">Geografie</option>
                    <option value="biologie">Biologie</option>
                    <option value="fizica">Fizică</option>
                    <option value="chimie">Chimie</option>
                    <option value="matematica">Matematică</option>
                    <option value="literatura">Literatură</option>
                    <option value="arta">Artă</option>
                    <option value="sport">Sport</option>
                    <option value="muzica">Muzică</option>
                    <option value="cinematografie">Cinematografie</option>
                    <option value="tehnologie">Tehnologie</option>
                    <option value="informatica">Informatică</option>
                    <option value="cultura_generala">Cultură Generală</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Dificultate</label>
                  <select
                    value={newDifficulty}
                    onChange={(e) => setNewDifficulty(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200"
                  >
                    <option value="usor">Ușor</option>
                    <option value="mediu">Mediu</option>
                    <option value="greu">Greu</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Textul Întrebării (scurt și direct)</label>
                <textarea
                  required
                  rows={2}
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  placeholder="ex: În ce an a avut loc Marea Unire de la Alba Iulia?"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-slate-200 focus:outline-none"
                />
              </div>

              {newType === 'choice' && (
                <div className="space-y-2">
                  <label className="font-bold text-slate-300 block">
                    Variante de Răspuns (bifează răspunsul corect):
                  </label>
                  {[0, 1, 2, 3].map((idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correctAnswer"
                        checked={newCorrectIndex === idx}
                        onChange={() => setNewCorrectIndex(idx)}
                        className="accent-purple-500"
                      />
                      <span className="font-mono font-bold text-slate-400">{String.fromCharCode(65 + idx)}:</span>
                      <input
                        type="text"
                        required
                        value={newOptions[idx]}
                        onChange={(e) => {
                          const copy = [...newOptions];
                          copy[idx] = e.target.value;
                          setNewOptions(copy);
                        }}
                        placeholder={`Varianta ${String.fromCharCode(65 + idx)}`}
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-200"
                      />
                    </div>
                  ))}
                </div>
              )}

              {newType === 'estimation' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Număr Țintă (Răspuns Exact)</label>
                    <input
                      type="number"
                      required
                      value={newTargetNumber}
                      onChange={(e) => setNewTargetNumber(e.target.value)}
                      placeholder="ex: 1918"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Unitate de Măsură</label>
                    <input
                      type="text"
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      placeholder="ex: ani, metri, km, kg"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-300 block mb-1">Explicație (Opțional)</label>
                <input
                  type="text"
                  value={newExplanation}
                  onChange={(e) => setNewExplanation(e.target.value)}
                  placeholder="Context istoric / științific..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingQuestion(null);
                  }}
                  className="rounded-xl border border-slate-700 px-4 py-2 font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-purple-600 px-5 py-2 font-bold text-white hover:bg-purple-500 shadow-md shadow-purple-600/20"
                >
                  Salvează Întrebarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import JSON Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-left">
            <h3 className="font-serif text-xl font-bold text-slate-100 flex items-center gap-2">
              <Upload className="h-5 w-5 text-purple-400" /> Import Masiv Întrebări (JSON)
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Lipește un array JSON de obiecte cu structura: question, type, category, difficulty, options,
              correctAnswerIndex, targetNumber.
            </p>

            <textarea
              rows={8}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='[{"type":"choice","category":"istorie","difficulty":"mediu","question":"...","options":["A","B","C","D"],"correctAnswerIndex":1}]'
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:outline-none"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Anulează
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={!importJson.trim()}
                className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-40"
              >
                Importă Întrebările
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
