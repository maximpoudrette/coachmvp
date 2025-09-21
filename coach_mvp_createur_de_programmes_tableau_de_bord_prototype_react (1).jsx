import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Save, Trash2, BarChart3, Clock, Dumbbell, Users } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/**
 * CoachMVP – Prototype monofichier
 * - Création de programmes (exercices, séries, reps, charge, RPE, repos)
 * - Journal d'entraînements (séances)
 * - Calculs: volume (kg), intensité (proxy), durée totale (min)
 * - Dashboards: Volume / Intensité / Temps
 * - Persistance locale via localStorage
 *
 * ⚠️ Données factices incluses. Idéal pour itérer rapidement sur l'UX.
 */

// ---- Types ----
const emptyExercise = () => ({
  name: "Squat arrière",
  sets: 3,
  reps: 5,
  load: 80, // kg
  rpe: 7.5,
  rest: 120, // sec
  tempo: "2-0-1",
});

// ---- Utils ----
const fmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 });

function estimateOneRM_Epley(load, reps) {
  // Epley: 1RM ≈ load * (1 + reps/30)
  return load * (1 + reps / 30);
}

function setDurationSeconds(reps, tempoStr, restSec) {
  // tempo format "ecc-pause-conc" en secondes approximatives
  const [ecc, pause, conc] = (tempoStr || "2-0-1").split("-").map((n) => parseFloat(n) || 0);
  const timePerRep = ecc + pause + conc; // sec/rep
  return reps * timePerRep + restSec;
}

function calcSessionMetrics(session) {
  // session = { date, notes, exercises: [ {name, sets, reps, load, rpe, rest, tempo} ] }
  let volume = 0; // kg totaux
  let timeSec = 0; // secondes
  let intensitySum = 0; // proxy
  let setCount = 0;

  session.exercises.forEach((ex) => {
    const { sets, reps, load, rpe, rest, tempo } = ex;
    const setsN = Number(sets) || 0;
    const repsN = Number(reps) || 0;
    const loadN = Number(load) || 0;
    const rpeN = Number(rpe) || 0;
    for (let s = 0; s < setsN; s++) {
      volume += repsN * loadN;
      const est1RM = estimateOneRM_Epley(loadN, repsN);
      const relIntensity = est1RM > 0 ? loadN / est1RM : 0; // 0..1
      // Pondération simple par RPE pour un proxy d'intensité
      const intensity = relIntensity * (rpeN / 10);
      intensitySum += intensity;
      setCount += 1;
      timeSec += setDurationSeconds(repsN, tempo, rest);
    }
  });

  const avgIntensity = setCount > 0 ? intensitySum / setCount : 0;
  return {
    volumeKg: volume,
    durationMin: timeSec / 60,
    avgIntensity, // 0..1
  };
}

function weekKey(dateStr) {
  const d = new Date(dateStr);
  // ISO week (approx): year-Wxx
  const year = d.getUTCFullYear();
  const firstThursday = (y) => {
    const th = new Date(Date.UTC(y, 0, 1));
    while (th.getUTCDay() !== 4) th.setUTCDate(th.getUTCDate() + 1);
    return th;
  };
  const th = firstThursday(year);
  const diffDays = Math.floor((d - th) / 86400000);
  const week = 1 + Math.floor((diffDays + 3) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function aggregateWeekly(sessions) {
  const byWeek = {};
  sessions.forEach((s) => {
    const wk = weekKey(s.date);
    const m = calcSessionMetrics(s);
    if (!byWeek[wk]) byWeek[wk] = { volumeKg: 0, durationMin: 0, intensitySum: 0, sessions: 0 };
    byWeek[wk].volumeKg += m.volumeKg;
    byWeek[wk].durationMin += m.durationMin;
    byWeek[wk].intensitySum += m.avgIntensity;
    byWeek[wk].sessions += 1;
  });
  return Object.entries(byWeek).map(([week, v]) => ({
    week,
    volumeKg: Math.round(v.volumeKg),
    durationMin: Math.round(v.durationMin),
    avgIntensity: v.sessions ? Number((v.intensitySum / v.sessions).toFixed(3)) : 0,
  }));
}

// ---- Local storage helpers ----
const LS_KEY = "coachmvp_state_v1";
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

// ---- Demo seeds ----
const seedProgram = {
  id: "prog-1",
  name: "Force – Full Body (3 j/sem)",
  notes: "Cycle 4 semaines – progression 2.5 kg si RPE <8.",
  days: [
    {
      label: "Jour A",
      exercises: [
        { name: "Squat arrière", sets: 5, reps: 5, load: 85, rpe: 7.5, rest: 150, tempo: "3-0-1" },
        { name: "Développé couché", sets: 5, reps: 5, load: 70, rpe: 8, rest: 120, tempo: "2-1-1" },
        { name: "Row barre", sets: 4, reps: 8, load: 60, rpe: 7, rest: 90, tempo: "2-0-2" },
      ],
    },
    {
      label: "Jour B",
      exercises: [
        { name: "Soulevé de terre", sets: 4, reps: 4, load: 110, rpe: 7.5, rest: 180, tempo: "2-0-1" },
        { name: "Dév. militaire", sets: 4, reps: 6, load: 45, rpe: 8, rest: 120, tempo: "2-0-1" },
        { name: "Tractions", sets: 4, reps: 6, load: 0, rpe: 8, rest: 90, tempo: "2-0-1" },
      ],
    },
  ],
};

const seedSessions = [
  {
    id: "s1",
    date: new Date().toISOString().slice(0, 10),
    notes: "Bonne énergie",
    exercises: seedProgram.days[0].exercises,
  },
  {
    id: "s0",
    date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    notes: "RPE hauts",
    exercises: seedProgram.days[1].exercises,
  },
];

// ---- UI Components ----
function StatCard({ icon: Icon, title, value, suffix }) {
  return (
    <div className="rounded-2xl shadow p-4 bg-white/80 border flex items-center gap-3">
      <div className="p-3 rounded-xl bg-gray-100"><Icon className="w-6 h-6" /></div>
      <div>
        <div className="text-xs text-gray-500">{title}</div>
        <div className="text-xl font-semibold">{value}{suffix || ""}</div>
      </div>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        {right}
      </div>
      <div className="rounded-2xl border bg-white/80 shadow p-4">{children}</div>
    </div>
  );
}

function ExerciseRow({ ex, onChange, onDelete }) {
  const handle = (k, v) => onChange({ ...ex, [k]: v });
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <input className="col-span-3 input" value={ex.name} onChange={(e) => handle("name", e.target.value)} />
      <input className="col-span-1 input" type="number" value={ex.sets} onChange={(e) => handle("sets", +e.target.value)} />
      <input className="col-span-1 input" type="number" value={ex.reps} onChange={(e) => handle("reps", +e.target.value)} />
      <input className="col-span-2 input" type="number" value={ex.load} onChange={(e) => handle("load", +e.target.value)} />
      <input className="col-span-1 input" type="number" step="0.5" value={ex.rpe} onChange={(e) => handle("rpe", +e.target.value)} />
      <input className="col-span-1 input" value={ex.tempo} onChange={(e) => handle("tempo", e.target.value)} />
      <input className="col-span-1 input" type="number" value={ex.rest} onChange={(e) => handle("rest", +e.target.value)} />
      <button className="col-span-1 icon-btn" onClick={onDelete} title="Supprimer">
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );
}

function ProgramBuilder({ program, setProgram }) {
  const addExercise = (dayIdx) => {
    const days = [...program.days];
    days[dayIdx] = { ...days[dayIdx], exercises: [...days[dayIdx].exercises, emptyExercise()] };
    setProgram({ ...program, days });
  };
  const updateExercise = (dayIdx, exIdx, next) => {
    const days = [...program.days];
    const exs = [...days[dayIdx].exercises];
    exs[exIdx] = next;
    days[dayIdx] = { ...days[dayIdx], exercises: exs };
    setProgram({ ...program, days });
  };
  const deleteExercise = (dayIdx, exIdx) => {
    const days = [...program.days];
    const exs = days[dayIdx].exercises.filter((_, i) => i !== exIdx);
    days[dayIdx] = { ...days[dayIdx], exercises: exs };
    setProgram({ ...program, days });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" value={program.name} onChange={(e) => setProgram({ ...program, name: e.target.value })} />
        <input className="input" value={program.notes} onChange={(e) => setProgram({ ...program, notes: e.target.value })} />
      </div>

      {program.days.map((day, di) => (
        <Section key={di} title={day.label} right={<button className="btn" onClick={() => addExercise(di)}><Plus className="w-4 h-4 mr-1"/>Ajouter un exercice</button>}>
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 mb-2">
            <div className="col-span-3">Exercice</div>
            <div className="col-span-1">Séries</div>
            <div className="col-span-1">Reps</div>
            <div className="col-span-2">Charge (kg)</div>
            <div className="col-span-1">RPE</div>
            <div className="col-span-1">Tempo</div>
            <div className="col-span-1">Repos (s)</div>
            <div className="col-span-1"></div>
          </div>
          <div className="space-y-2">
            {day.exercises.map((ex, ei) => (
              <ExerciseRow
                key={ei}
                ex={ex}
                onChange={(next) => updateExercise(di, ei, next)}
                onDelete={() => deleteExercise(di, ei)}
              />
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function SessionLogger({ sessions, setSessions, program }) {
  const addFromDay = (dayIdx) => {
    const exs = program.days[dayIdx].exercises.map((e) => ({ ...e }));
    setSessions([
      ...sessions,
      { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), notes: "", exercises: exs },
    ]);
  };
  const updateSession = (idx, next) => {
    const s = [...sessions];
    s[idx] = next;
    setSessions(s);
  };
  const deleteSession = (idx) => setSessions(sessions.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {program.days.map((d, i) => (
          <button key={i} className="btn" onClick={() => addFromDay(i)}>
            <Plus className="w-4 h-4 mr-1"/>Nouvelle séance depuis {d.label}
          </button>
        ))}
      </div>

      {sessions.map((s, i) => {
        const m = calcSessionMetrics(s);
        return (
          <Section key={s.id} title={`Séance du ${s.date}`} right={<button className="icon-btn" onClick={() => deleteSession(i)}><Trash2 className="w-4 h-4"/></button>}>
            <div className="grid gap-2 sm:grid-cols-4 mb-3">
              <input className="input" type="date" value={s.date} onChange={(e) => updateSession(i, { ...s, date: e.target.value })} />
              <input className="input sm:col-span-3" placeholder="Notes" value={s.notes} onChange={(e) => updateSession(i, { ...s, notes: e.target.value })} />
            </div>
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 mb-2">
              <div className="col-span-3">Exercice</div>
              <div className="col-span-1">Séries</div>
              <div className="col-span-1">Reps</div>
              <div className="col-span-2">Charge (kg)</div>
              <div className="col-span-1">RPE</div>
              <div className="col-span-1">Tempo</div>
              <div className="col-span-1">Repos (s)</div>
              <div className="col-span-1"></div>
            </div>
            <div className="space-y-2">
              {s.exercises.map((ex, ei) => (
                <ExerciseRow
                  key={ei}
                  ex={ex}
                  onChange={(next) => {
                    const exs = [...s.exercises];
                    exs[ei] = next;
                    updateSession(i, { ...s, exercises: exs });
                  }}
                  onDelete={() => {
                    const exs = s.exercises.filter((_, j) => j !== ei);
                    updateSession(i, { ...s, exercises: exs });
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <StatCard icon={Dumbbell} title="Volume" value={fmt.format(m.volumeKg)} suffix=" kg" />
              <StatCard icon={BarChart3} title="Intensité moy." value={fmt.format(m.avgIntensity * 100)} suffix=" %" />
              <StatCard icon={Clock} title="Durée estimée" value={fmt.format(m.durationMin)} suffix=" min" />
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function Analytics({ sessions }) {
  const weekly = useMemo(() => aggregateWeekly(sessions), [sessions]);

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="rounded-2xl border bg-white/80 shadow p-4">
        <h4 className="font-semibold mb-2">Volume hebdo (kg)</h4>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="volumeKg" name="Volume (kg)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border bg-white/80 shadow p-4">
        <h4 className="font-semibold mb-2">Intensité moyenne</h4>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="avgIntensity" name="Intensité (0-1)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border bg-white/80 shadow p-4">
        <h4 className="font-semibold mb-2">Temps total hebdo (min)</h4>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="durationMin" name="Durée (min)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function TopNav({ tab, setTab }) {
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "program", label: "Programme" },
    { key: "sessions", label: "Séances" },
    { key: "clients", label: "Clients" },
  ];
  return (
    <div className="flex items-center gap-2 bg-white/80 border rounded-2xl p-1 shadow">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`px-4 py-2 rounded-xl text-sm ${tab === t.key ? "bg-gray-900 text-white" : "hover:bg-gray-100"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Clients({ clients, setClients }) {
  const addClient = () => setClients([...clients, { id: crypto.randomUUID(), name: "Nouveau client", email: "", notes: "" }]);
  const updateClient = (idx, next) => {
    const list = [...clients];
    list[idx] = next;
    setClients(list);
  };
  const delClient = (idx) => setClients(clients.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <h3 className="text-lg font-semibold">Clients</h3>
        <button className="btn" onClick={addClient}><Plus className="w-4 h-4 mr-1"/>Ajouter</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {clients.map((c, i) => (
          <div key={c.id} className="rounded-2xl border bg-white/80 shadow p-4 space-y-2">
            <input className="input" value={c.name} onChange={(e) => updateClient(i, { ...c, name: e.target.value })} />
            <input className="input" placeholder="email" value={c.email} onChange={(e) => updateClient(i, { ...c, email: e.target.value })} />
            <textarea className="input" placeholder="notes" value={c.notes} onChange={(e) => updateClient(i, { ...c, notes: e.target.value })} />
            <div className="flex justify-end">
              <button className="icon-btn" onClick={() => delClient(i)}><Trash2 className="w-4 h-4"/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoachMVP() {
  const saved = loadState();
  const [tab, setTab] = useState("dashboard");
  const [program, setProgram] = useState(saved?.program || seedProgram);
  const [sessions, setSessions] = useState(saved?.sessions || seedSessions);
  const [clients, setClients] = useState(saved?.clients || [
    { id: "c1", name: "Athlète A", email: "a@demo.com", notes: "Hypertrophie" },
  ]);

  useEffect(() => {
    saveState({ program, sessions, clients });
  }, [program, sessions, clients]);

  const allMetrics = useMemo(() => {
    const vols = sessions.map((s) => calcSessionMetrics(s).volumeKg);
    const times = sessions.map((s) => calcSessionMetrics(s).durationMin);
    const ints = sessions.map((s) => calcSessionMetrics(s).avgIntensity);
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    return {
      volumeKg: sum(vols),
      durationMin: sum(times),
      avgIntensity: ints.length ? sum(ints) / ints.length : 0,
    };
  }, [sessions]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">CoachMVP – Créateur de programmes</h1>
            <p className="text-sm text-gray-500">Prototype: programmes, séances, analytics (volume, intensité, durée).</p>
          </div>
          <TopNav tab={tab} setTab={setTab} />
        </div>

        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard icon={Dumbbell} title="Volume total" value={fmt.format(allMetrics.volumeKg)} suffix=" kg" />
              <StatCard icon={BarChart3} title="Intensité moyenne" value={fmt.format(allMetrics.avgIntensity * 100)} suffix=" %" />
              <StatCard icon={Clock} title="Temps cumulé" value={fmt.format(allMetrics.durationMin)} suffix=" min" />
            </div>
            <Analytics sessions={sessions} />
          </div>
        )}

        {tab === "program" && (
          <ProgramBuilder program={program} setProgram={setProgram} />
        )}

        {tab === "sessions" && (
          <SessionLogger sessions={sessions} setSessions={setSessions} program={program} />
        )}

        {tab === "clients" && (
          <Clients clients={clients} setClients={setClients} />
        )}

        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => { saveState({ program, sessions, clients }); }}>
            <Save className="w-4 h-4 mr-1"/>Sauvegarder localement
          </button>
          <button className="btn" onClick={() => { localStorage.removeItem(LS_KEY); window.location.reload(); }}>
            <Trash2 className="w-4 h-4 mr-1"/>Réinitialiser
          </button>
        </div>
      </div>

      {/* Styles utilitaires minimalistes */}
      <style>{`
        .input { @apply w-full rounded-xl border px-3 py-2 bg-white/90; }
        .btn { @apply inline-flex items-center rounded-xl border px-3 py-2 bg-white hover:bg-gray-50 shadow; }
        .icon-btn { @apply inline-flex items-center justify-center rounded-xl border px-2 py-2 bg-white hover:bg-gray-50 shadow; }
      `}</style>
    </motion.div>
  );
}
