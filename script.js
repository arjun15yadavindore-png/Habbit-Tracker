(() => {
  const STORAGE_KEY = 'orbit-habits-v1';
  const LEGACY_KEY = 'habits';
  const categoryIcons = { Wellness: '💧', Learning: '📚', Fitness: '🏃', Mindfulness: '🧘', Productivity: '🎯', Personal: '🌱' };
  const quotes = [
    'You don\'t have to see the whole staircase, just take the first step.',
    'Little by little, a little becomes a lot.',
    'You are allowed to be a work in progress and still be proud of yourself.',
    'The secret of your future is hidden in your daily routine.',
    'Show up for yourself. The rest gets easier with practice.'
  ];
  let habits = loadHabits();
  let activeFilter = 'all';
  let editingId = null;
  let toastTimeout;

  const $ = (id) => document.getElementById(id);
  const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dateFromKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function loadHabits() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(stored)) return stored.map(normalizeHabit).filter(Boolean);
      // Migrate the user's original habit data without losing existing entries.
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (Array.isArray(legacy)) {
        const migrated = legacy.map((item) => normalizeHabit({ ...item, category: item.category || 'Personal' })).filter(Boolean);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) { console.warn('Could not load saved habits:', error); }
    return [];
  }

  function normalizeHabit(item) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) return null;
    return {
      id: item.id || uid(), name: item.name.trim(), category: categoryIcons[item.category] ? item.category : 'Personal',
      frequency: ['Every day', 'Weekdays', 'Weekends'].includes(item.frequency) ? item.frequency : 'Every day',
      dates: Array.isArray(item.dates) ? [...new Set(item.dates.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort() : []
    };
  }
  function saveHabits() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(habits)); } catch (error) { showToast('Could not save changes in this browser.'); } }
  function isDoneToday(habit) { return habit.dates.includes(todayKey()); }
  function streakFor(habit) {
    const dates = new Set(habit.dates);
    let cursor = dateFromKey(todayKey());
    if (!dates.has(todayKey())) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (dates.has(todayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    return streak;
  }
  function isScheduled(habit, date) {
    const day = date.getDay();
    if (habit.frequency === 'Weekdays') return day >= 1 && day <= 5;
    if (habit.frequency === 'Weekends') return day === 0 || day === 6;
    return true;
  }
  function prettyToday() { $('todayLabel').textContent = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()); }
  function showToast(message) {
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('show'), 2400);
  }
  function setFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-tab').forEach((button) => button.classList.toggle('active', button.dataset.filter === filter));
    renderHabits();
  }
  function renderHabits() {
    const query = $('searchInput').value.trim().toLowerCase();
    const filtered = habits.filter((habit) => {
      const done = isDoneToday(habit);
      return (activeFilter === 'all' || (activeFilter === 'done' && done) || (activeFilter === 'pending' && !done)) && `${habit.name} ${habit.category}`.toLowerCase().includes(query);
    });
    $('habitList').innerHTML = filtered.map((habit) => {
      const done = isDoneToday(habit);
      const index = habits.findIndex((item) => item.id === habit.id);
      return `<article class="habit-item ${done ? 'is-done' : ''}">
        <button class="habit-check" data-action="toggle" data-id="${escapeHtml(habit.id)}" aria-label="${done ? 'Undo' : 'Complete'} ${escapeHtml(habit.name)}" aria-pressed="${done}">${done ? '✓' : ''}</button>
        <div class="habit-emoji" aria-hidden="true">${categoryIcons[habit.category] || '🌱'}</div>
        <div class="habit-copy"><div class="habit-title">${escapeHtml(habit.name)}</div><div class="habit-meta"><span class="category-tag">${escapeHtml(habit.category)}</span><span>${escapeHtml(habit.frequency)}</span><span>·</span><span>${streakFor(habit)} day streak</span></div></div>
        <div class="habit-streak">🔥 ${streakFor(habit)}</div>
        <div class="habit-actions"><button class="tiny-action" data-action="edit" data-id="${escapeHtml(habit.id)}" aria-label="Edit ${escapeHtml(habit.name)}" title="Edit habit">✎</button><button class="tiny-action" data-action="delete" data-id="${escapeHtml(habit.id)}" aria-label="Delete ${escapeHtml(habit.name)}" title="Delete habit">×</button></div>
      </article>`;
    }).join('');
    $('emptyState').classList.toggle('visible', filtered.length === 0);
    $('habitList').style.display = filtered.length ? 'grid' : 'none';
    if (!habits.length) { $('emptyState').querySelector('h3').textContent = 'Your next chapter starts here'; $('emptyState').querySelector('p').textContent = 'Add your first habit and make a little progress today.'; }
    else if (!filtered.length) { $('emptyState').querySelector('h3').textContent = 'No habits found'; $('emptyState').querySelector('p').textContent = 'Try another search or switch the filter to see your habits.'; }
    updateStats(); renderWeek();
  }
  function updateStats() {
    const done = habits.filter(isDoneToday).length;
    const percent = habits.length ? Math.round(done / habits.length * 100) : 0;
    $('progressValue').textContent = `${percent}%`; $('completedCount').textContent = `${done} of ${habits.length} habits done`;
    $('progressBar').style.width = `${percent}%`; $('activeCount').textContent = habits.length;
    const best = habits.reduce((max, habit) => Math.max(max, streakFor(habit)), 0);
    $('bestStreak').innerHTML = `${best} <em>${best === 1 ? 'day' : 'days'}</em>`;
    $('streakMessage').textContent = best ? (best >= 7 ? 'A week of consistency!' : 'Keep the momentum going') : 'Your streak starts today';
    $('habitCountPill').textContent = habits.length;
  }
  function renderWeek() {
    const today = new Date(); const mondayOffset = (today.getDay() + 6) % 7; const monday = new Date(today); monday.setDate(today.getDate() - mondayOffset);
    const days = Array.from({ length: 7 }, (_, i) => { const date = new Date(monday); date.setDate(monday.getDate() + i); const key = todayKey(date); const count = habits.filter((h) => h.dates.includes(key)).length; return { date, key, count, today: key === todayKey() }; });
    const max = Math.max(1, ...days.map((day) => day.count));
    $('weekChart').innerHTML = days.map((day) => `<div class="day-column ${day.today ? 'today' : ''}" title="${day.date.toLocaleDateString()} — ${day.count} check-ins"><span class="day-value">${day.count || '·'}</span><div class="day-bar-wrap"><div class="day-bar" style="height:${Math.max(5, day.count / max * 100)}%"></div></div><span class="day-label">${day.date.toLocaleDateString('en', { weekday: 'short' })}</span></div>`).join('');
    const total = days.reduce((sum, day) => sum + day.count, 0); $('weekTotal').textContent = `${total} ${total === 1 ? 'check-in' : 'check-ins'}`;
  }
  function openModal(habit = null) {
    editingId = habit ? habit.id : null; $('modalTitle').textContent = habit ? 'Edit your habit' : 'Create a habit'; $('saveHabitButton').innerHTML = habit ? 'Save changes <span>→</span>' : 'Create habit <span>→</span>';
    $('habitName').value = habit ? habit.name : ''; $('habitCategory').value = habit ? habit.category : 'Wellness'; $('habitFrequency').value = habit ? habit.frequency : 'Every day';
    $('habitModal').classList.add('open'); $('habitModal').setAttribute('aria-hidden', 'false'); setTimeout(() => $('habitName').focus(), 50);
  }
  function closeModal() { $('habitModal').classList.remove('open'); $('habitModal').setAttribute('aria-hidden', 'true'); editingId = null; }
  function toggleHabit(id) {
    const habit = habits.find((item) => item.id === id); if (!habit) return;
    const today = todayKey();
    if (habit.dates.includes(today)) { habit.dates = habit.dates.filter((date) => date !== today); showToast('Check-in removed. You can try again today.'); }
    else { habit.dates.push(today); habit.dates.sort(); showToast('Nice work! One small win added ✨'); }
    saveHabits(); renderHabits();
  }
  function deleteHabit(id) {
    const habit = habits.find((item) => item.id === id); if (!habit) return;
    if (!window.confirm(`Delete “${habit.name}”? Its check-in history will also be removed.`)) return;
    habits = habits.filter((item) => item.id !== id); saveHabits(); renderHabits(); showToast('Habit deleted.');
  }

  $('openHabitModal').addEventListener('click', () => openModal()); $('emptyAddButton').addEventListener('click', () => openModal());
  $('closeHabitModal').addEventListener('click', closeModal); $('cancelHabit').addEventListener('click', closeModal);
  $('habitModal').addEventListener('click', (event) => { if (event.target === $('habitModal')) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  $('habitForm').addEventListener('submit', (event) => {
    event.preventDefault(); const name = $('habitName').value.trim(); if (!name) { $('habitName').focus(); return; }
    const category = $('habitCategory').value; const frequency = $('habitFrequency').value;
    if (editingId) { const habit = habits.find((item) => item.id === editingId); if (habit) Object.assign(habit, { name, category, frequency }); showToast('Habit updated successfully.'); }
    else { habits.unshift({ id: uid(), name, category, frequency, dates: [] }); showToast('New habit created. Let’s make it stick!'); }
    saveHabits(); closeModal(); renderHabits();
  });
  $('habitList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const { action, id } = button.dataset; const habit = habits.find((item) => item.id === id); if (!habit) return;
    if (action === 'toggle') toggleHabit(id); if (action === 'edit') openModal(habit); if (action === 'delete') deleteHabit(id);
  });
  document.querySelectorAll('.filter-tab').forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  $('searchInput').addEventListener('input', renderHabits);
  $('themeToggle').addEventListener('click', () => { document.body.classList.toggle('light-theme'); const light = document.body.classList.contains('light-theme'); $('themeToggle').textContent = light ? '☾' : '☼'; $('themeToggle').setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme'); try { localStorage.setItem('orbit-theme', light ? 'light' : 'dark'); } catch (_) {} });
  try { if (localStorage.getItem('orbit-theme') === 'light') { document.body.classList.add('light-theme'); $('themeToggle').textContent = '☾'; $('themeToggle').setAttribute('aria-label', 'Switch to dark theme'); } } catch (_) {}
  $('quoteText').textContent = quotes[new Date().getDate() % quotes.length];
  prettyToday(); renderHabits();
})();
