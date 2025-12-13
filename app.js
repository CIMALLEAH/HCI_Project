    const AppData = {
      user: { firstName: 'Damian', lastName: 'Alvah', email: 'dalvah@gmail.com' },
      events: [
        { id: 1, kind: 'event', category: 'school', type: 'school', title: 'IT 321', fullTitle: 'Human-Computer Interaction', location: 'Online', startDate: '2025-12-06', startTime: '10:00', endDate: '2025-12-06', endTime: '13:30', priority: 'medium', reminder: '10m', completed: false },
        { id: 2, kind: 'event', category: 'school', type: 'school', title: 'CS 311', fullTitle: 'Automata Theory and Formal Languages', location: 'Online', startDate: '2025-12-12', startTime: '15:00', endDate: '2025-12-12', endTime: '23:30', priority: 'medium', reminder: '30m', completed: false },
        { id: 8, kind: 'task', category: 'school', type: 'school', title: 'Submit IT 321 report', fullTitle: 'Submit final report for HCI', location: 'Online', startDate: '2025-12-05', dueDate: '2025-12-12', startTime: '23:59', priority: 'high', reminder: '1d', completed: false },
        { id: 9, kind: 'task', category: 'personal', type: 'personal', title: 'Video Editing', fullTitle: 'Editing of video - Cutting and pasting of clips as well as finding music that fits well with...', location: 'Online', startDate: '2025-12-10', dueDate: '2025-12-10', startTime: '10:00', priority: 'medium', reminder: '1d', completed: false }
      ],
      conflicts: [
        { title: 'Schedule Conflict Detected', description: 'Personal appointment overlaps with IT 321 on Dec 6' }
      ],
      settings: { notifications: { enabled: true, sound: true, vibrate: false } },
      alarms: [
        { id: 1, time: '08:00', label: 'Morning Alarm', enabled: true },
        { id: 2, time: '14:00', label: 'Afternoon Reminder', enabled: false }
      ],

      getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
      },

      formatDate(dateString) {
        const d = new Date(dateString);
        const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
        return d.toLocaleDateString('en-US', options);
      },

      getTodayEvents() {
        const today = new Date().toISOString().split('T')[0];
        return this.events.filter(e => e.kind === 'event' && e.startDate === today);
      },

      getUpcomingTasks(days = 7) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.events.filter(e => {
          if (e.kind !== 'task' || e.completed) return false;
          const dueDate = new Date(e.dueDate || e.startDate);
          const diff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
          return diff >= 0 && diff <= days;
        });
      },

      getCurrentEvent() {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        return this.events.find(ev => {
          if (ev.startDate !== todayStr || ev.kind !== 'event') return false;
          const [sh, sm] = ev.startTime.split(':').map(Number);
          const [eh, em] = ev.endTime.split(':').map(Number);
          const start = new Date(now); start.setHours(sh, sm, 0, 0);
          const end = new Date(now); end.setHours(eh, em, 0, 0);
          return now >= start && now <= end;
        });
      },

      getUpcomingEvents(days = 2) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.events
          .filter(e => e.kind === 'event')
          .map(e => {
            const evDate = new Date(e.startDate);
            const diff = Math.ceil((evDate - today) / (1000 * 60 * 60 * 24));
            return { ...e, daysUntil: diff };
          })
          .filter(e => e.daysUntil >= 0 && e.daysUntil <= days)
          .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
      }
    };

    let countdownInterval;
    // Storage key
    const STORAGE_KEY = 'planease_app_v1';
    // Scheduler state
    const lastTriggered = {}; // alarmId -> 'YYYY-MM-DDTHH:MM' last fired minute
    const snoozeTimeouts = {}; // alarmId -> timeoutID
    let alarmAudioElement = null;

    function renderPage() {
      loadAppDataFromStorage();
      startAlarmScheduler();
      renderGreeting();
      renderDashboard();
      renderAlerts();
      renderTodaySchedule();
      renderUpcomingTasks();
      setInterval(updateTime, 1000);
    }

    // Persistence helpers
    function saveAppDataToStorage() {
      try {
        const payload = { alarms: AppData.alarms || [], settings: AppData.settings || {} };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn('Failed to save app data', e);
      }
    }

    function loadAppDataFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed.alarms && Array.isArray(parsed.alarms)) AppData.alarms = parsed.alarms;
        if (parsed.settings) AppData.settings = Object.assign(AppData.settings || {}, parsed.settings);
      } catch (e) {
        console.warn('Failed to load app data', e);
      }
    }

    // Audio setup: try to use an audio file if available, otherwise use WebAudio fallback
    function ensureAlarmAudio() {
      if (alarmAudioElement) return alarmAudioElement;
      const audio = document.createElement('audio');
      audio.id = 'alarmAudio';
      audio.preload = 'auto';
      audio.src = 'assets/alarm.mp3';
      audio.addEventListener('error', () => {
        // file not found or failed; we'll use WebAudio as fallback when playing
        alarmAudioElement = null;
      });
      document.body.appendChild(audio);
      alarmAudioElement = audio;
      return alarmAudioElement;
    }

    function playAlarmSoundLoop() {
      // prefer audio element
      const audio = ensureAlarmAudio();
      if (audio && audio.play) {
        audio.loop = true;
        audio.currentTime = 0;
        audio.play().catch(() => {
          // fallback to beep
          playBeepLoopFallback();
        });
        return;
      }
      playBeepLoopFallback();
    }

    let beepOsc = null;
    function playBeepLoopFallback() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.06;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        beepOsc = { osc: o, ctx, gain: g };
      } catch (e) {
        console.warn('Audio fallback failed', e);
      }
    }

    function stopAlarmSound() {
      try {
        if (alarmAudioElement) {
          alarmAudioElement.pause();
          alarmAudioElement.currentTime = 0;
        }
      } catch (e) {}
      try {
        if (beepOsc && beepOsc.osc) {
          beepOsc.osc.stop();
          beepOsc.ctx.close();
          beepOsc = null;
        }
      } catch (e) {}
    }

    // Scheduler: check every 10 seconds for alarms to fire
    let alarmSchedulerInterval = null;
    function startAlarmScheduler() {
      if (alarmSchedulerInterval) return;
      alarmSchedulerInterval = setInterval(checkAlarmsToFire, 10000);
      // initial immediate check
      checkAlarmsToFire();
    }

    function stopAlarmScheduler() {
      if (alarmSchedulerInterval) clearInterval(alarmSchedulerInterval);
      alarmSchedulerInterval = null;
    }

    function checkAlarmsToFire() {
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
      const minuteKey = now.toISOString().slice(0,16); // YYYY-MM-DDTHH:MM

      // check normal alarms
      (AppData.alarms || []).forEach(a => {
        if (!a.enabled) return;
        if (a.time === hhmm) {
          const last = lastTriggered[a.id];
          if (last === minuteKey) return; // already triggered this minute
          lastTriggered[a.id] = minuteKey;
          fireAlarm(a);
        }
      });

      // check snoozes handled by timeouts (no extra check needed)
    }

    // Fire alarm UI + sound + vibration
    function fireAlarm(alarm) {
      // show firing overlay
      showFiringOverlay(alarm);
      // sound
      if (AppData.settings.notifications.sound) playAlarmSoundLoop();
      // vibrate
      if (AppData.settings.notifications.vibrate && navigator.vibrate) navigator.vibrate([300,100,300]);
    }

    // Show firing overlay with snooze/dismiss
    function showFiringOverlay(alarm) {
      let panel = document.getElementById('firingOverlay');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'firingOverlay';
        panel.className = 'alarm-overlay active';
        panel.innerHTML = `
          <div class="alarm-overlay-panel" id="firingPanel">
            <h2 id="firingTitle">Alarm</h2>
            <p id="firingTime" style="opacity:0.85;margin-bottom:12px"></p>
            <div style="display:flex;gap:12px;justify-content:center">
              <button class="resolve-btn" onclick="dismissFiringAlarm()">Dismiss</button>
              <button class="resolve-btn" onclick="snoozeFiringAlarm(5)">Snooze 5m</button>
              <button class="resolve-btn" onclick="snoozeFiringAlarm(10)">Snooze 10m</button>
            </div>
          </div>`;
        document.body.appendChild(panel);
      }
      panel.classList.add('active');
      document.getElementById('firingTitle').textContent = alarm.label || 'Alarm';
      document.getElementById('firingTime').textContent = alarm.time;
      // focus for accessibility
      panel.querySelector('.resolve-btn').focus();
      // store currently firing alarm
      panel._alarmRef = alarm;
    }

    function dismissFiringAlarm() {
      const panel = document.getElementById('firingOverlay');
      if (!panel) return;
      stopAlarmSound();
      if (navigator.vibrate) navigator.vibrate(0);
      panel.classList.remove('active');
      // nothing else: alarm remains scheduled for next day
    }

    function snoozeFiringAlarm(minutes) {
      const panel = document.getElementById('firingOverlay');
      if (!panel) return;
      const alarm = panel._alarmRef;
      if (!alarm) return;
      stopAlarmSound();
      if (navigator.vibrate) navigator.vibrate(0);
      panel.classList.remove('active');
      // schedule a timeout to fire after minutes
      if (snoozeTimeouts[alarm.id]) clearTimeout(snoozeTimeouts[alarm.id]);
      snoozeTimeouts[alarm.id] = setTimeout(() => {
        fireAlarm(alarm);
        delete snoozeTimeouts[alarm.id];
      }, minutes * 60 * 1000);
    }

    function renderGreeting() {
      document.getElementById('greeting').textContent = `${AppData.getGreeting()}, ${AppData.user.firstName}!`;
      document.getElementById('currentDate').textContent = AppData.formatDate(new Date().toISOString());
      updateTime();
    }

    function updateTime() {
      const now = new Date();
      document.getElementById('currentTime').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    function renderDashboard() {
      const container = document.getElementById('dashboardCards');
      let html = '';

      const currentEvent = AppData.getCurrentEvent();
      const upcomingEvent = AppData.getUpcomingEvents(2)[0];

      // Merged ongoing + upcoming card with hourglass divider
      html += `<div class="info-card">`;
      
      // LEFT SIDE: ONGOING
      if (currentEvent) {
        html += `
          <div class="card-section">
            <div class="card-section-label">Ends in</div>
            <div class="countdown" id="countdown">00:00:00</div>
            <div class="card-section-title">${currentEvent.title}</div>
          </div>`;
        setTimeout(() => updateCountdown(currentEvent.endTime), 100);
      } else {
        // Check if there are any events left today
        const todayEvents = AppData.getTodayEvents();
        const futureEvents = todayEvents.filter(e => {
          const [h, m] = e.startTime.split(':').map(Number);
          const eTime = new Date(); eTime.setHours(h, m, 0, 0);
          return eTime > new Date();
        });
        
        if (futureEvents.length > 0) {
          // Show next event countdown
          const nextEvent = futureEvents[0];
          html += `
            <div class="card-section">
              <div class="card-section-label">Ends in</div>
              <div class="countdown" id="countdown">-- -- --</div>
              <div class="card-section-title">Enjoy your break</div>
            </div>`;
        } else {
          // No more events today
          html += `
            <div class="card-section">
              <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
              <div class="card-section-title">No more events today</div>
              <div class="card-section-date">Enjoy the rest of your day</div>
            </div>`;
        }
      }

      // MIDDLE: HOURGLASS DIVIDER
      const hasOngoingCountdown = !!currentEvent;
      html += `
        <div class="card-hourglass-divider">
          <i class="fas fa-hourglass-end ${hasOngoingCountdown ? 'hourglass-spinner' : 'hourglass-static'}"></i>
        </div>`;

      // RIGHT SIDE: UPCOMING
      if (upcomingEvent && upcomingEvent.daysUntil <= 6) {
        const eventDate = new Date(upcomingEvent.startDate);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
        
        let dateLabel = '';
        if (diffDays === 0) dateLabel = 'Today';
        else if (diffDays === 1) dateLabel = 'Tomorrow';
        else {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          dateLabel = dayNames[eventDate.getDay()];
        }

        html += `
          <div class="card-section">
            <div class="card-section-label">Upcoming</div>
            <div class="card-section-value" style="color: #ffd700;">${upcomingEvent.startTime}</div>
            <div class="card-section-title">${upcomingEvent.title}</div>
            <div class="card-section-date">${dateLabel}</div>
          </div>`;
      } else {
        html += `
          <div class="card-section">
            <div class="card-section-label">No Upcoming</div>
            <div class="card-section-value">—</div>
            <div class="card-section-title">Events scheduled</div>
          </div>`;
      }

      html += `</div>`;

      html += `
        <div class="alarm-card">
          <div class="alarm-icon" title="View alarms">
            <i class="fas fa-bell" id="alarmIcon" style="cursor:pointer; font-size:48px; ${AppData.settings.notifications.enabled ? '' : 'opacity:0.45;'}" onclick="showAlarmPanel()"></i>
          </div>
          <div class="alarm-label">Alarms</div>
          <div id="alarmStatus" class="alarm-status"><span id="alarmStatusToggle" class="status-toggle" onclick="toggleNotifications()">${AppData.settings.notifications.enabled ? 'On' : 'Off'}</span></div>
        </div>`;

      container.innerHTML = html;
    }

    function updateCountdown(endTimeStr) {
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        const now = new Date();
        const [hours, minutes] = endTimeStr.split(':').map(Number);
        const end = new Date(now);
        end.setHours(hours, minutes, 0, 0);
        if (end < now) end.setDate(end.getDate() + 1);

        const totalSeconds = Math.max(0, (end - now) / 1000);
        if (totalSeconds === 0) {
          clearInterval(countdownInterval);
          renderDashboard();
          return;
        }

        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = Math.floor(totalSeconds % 60);

        const el = document.getElementById('countdown');
        if (el) {
          el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
      }, 1000);
    }

    function renderAlerts() {
      const container = document.getElementById('alertContainer');
      if (AppData.conflicts.length > 0) {
        container.innerHTML = AppData.conflicts.map(c => `
          <div class="alert">
            <div class="alert-icon">⚠️</div>
            <div class="alert-content">
              <h3>${c.title}</h3>
              <p>${c.description}</p>
            </div>
            <button class="resolve-btn" onclick="window.location.href='calendar.html'">Resolve</button>
          </div>
        `).join('');
      }
    }

    function renderTodaySchedule() {
      const container = document.getElementById('todaySchedule');
      const events = AppData.getTodayEvents();

      if (events.length === 0) {
        container.innerHTML = '<p class="no-events">Nothing scheduled for today.</p>';
        return;
      }

      container.innerHTML = events.map(event => {
        const indicatorColor = event.type === 'personal' ? '#c084fc' : event.type === 'work' ? '#3b82f6' : '#4a9eff';
        const typeIcon = event.type === 'school' ? 'fa-graduation-cap' : event.type === 'personal' ? 'fa-user' : 'fa-briefcase';
        return `
          <div class="event-item ${event.type}">
            <div class="event-header">
              <div class="event-title">
                <div class="event-indicator" style="background:${indicatorColor}"></div>
                <h3>${event.title}</h3>
              </div>
              <div class="event-badge ${event.type}">${event.type}</div>
            </div>
            <div class="event-details">
              <p>${event.fullTitle}</p>
              <p><i class="fas ${typeIcon}"></i> ${event.location}</p>
              <p class="event-time"><i class="far fa-clock"></i> ${event.startTime} - ${event.endTime}</p>
            </div>
          </div>`;
      }).join('');
    }

    function renderUpcomingTasks() {
      const container = document.getElementById('upcomingTasks');
      const tasks = AppData.getUpcomingTasks(7);

      if (tasks.length === 0) {
        container.innerHTML = '<p class="no-events">No upcoming tasks.</p>';
        return;
      }

      container.innerHTML = tasks.map(task => {
        const indicatorColor = task.type === 'personal' ? '#c084fc' : task.type === 'work' ? '#3b82f6' : '#4a9eff';
        const typeIcon = task.type === 'school' ? 'fa-graduation-cap' : task.type === 'personal' ? 'fa-user' : 'fa-briefcase';
        return `
          <div class="event-item ${task.type}">
            <div class="event-header">
              <div class="event-title">
                <div class="event-indicator" style="background:${indicatorColor}"></div>
                <h3>${task.title}</h3>
              </div>
              <div class="event-badge ${task.type}">${task.type}</div>
            </div>
            <div class="event-details">
              <p>${task.fullTitle}</p>
              <p><i class="fas ${typeIcon}"></i> ${task.location}</p>
              <p class="event-time"><i class="fas fa-calendar-check"></i> Due: ${new Date(task.dueDate || task.startDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })} at ${task.startTime}</p>
            </div>
          </div>`;
      }).join('');
    }

    /* Alarm panel and controls */
    function toggleNotifications() {
      AppData.settings.notifications.enabled = !AppData.settings.notifications.enabled;
      renderDashboard();
      // update alarm status text if panel is open
      const statusEl = document.getElementById('alarmStatusToggle') || document.getElementById('alarmStatus');
      if (statusEl) statusEl.textContent = AppData.settings.notifications.enabled ? 'On' : 'Off';
      saveAppDataToStorage();
      renderAlarmPanel();
      const nspan = document.getElementById('ctrl-notifications'); if (nspan) nspan.textContent = AppData.settings.notifications.enabled ? 'On' : 'Off';
    }

    function toggleSound() {
      AppData.settings.notifications.sound = !AppData.settings.notifications.sound;
      renderAlarmPanel();
      saveAppDataToStorage();
      const sspan = document.getElementById('ctrl-sound'); if (sspan) sspan.textContent = AppData.settings.notifications.sound ? 'On' : 'Off';
    }

    function toggleVibrate() {
      AppData.settings.notifications.vibrate = !AppData.settings.notifications.vibrate;
      renderAlarmPanel();
      saveAppDataToStorage();
      const vspan = document.getElementById('ctrl-vibrate'); if (vspan) vspan.textContent = AppData.settings.notifications.vibrate ? 'On' : 'Off';
    }

    function playSampleSound() {
      // simple beep via WebAudio
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.05;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, 300);
      } catch (e) {
        console.warn('Audio not supported', e);
      }

      if (AppData.settings.notifications.vibrate && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    }

    let editingAlarmId = null;

    function showAlarmPanel() {
      // create full-screen overlay panel
      let overlay = document.getElementById('alarmOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'alarmOverlay';
        overlay.className = 'alarm-overlay';
        overlay.innerHTML = `
          <div class="alarm-overlay-panel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h3 style="display:flex;gap:8px;align-items:center"><i class="fas fa-bell"></i> Alarms</h3>
              <div>
                <button class="resolve-btn" onclick="closeAlarmPanel()">Close</button>
              </div>
            </div>
            <div style="margin-bottom:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
              <div style="font-size:14px;opacity:0.95">Notifications: <span id="ctrl-notifications" onclick="toggleNotifications()" style="cursor:pointer;font-weight:700;color:#4a9eff">${AppData.settings.notifications.enabled ? 'On' : 'Off'}</span></div>
              <div style="font-size:14px;opacity:0.95">Sound: <span id="ctrl-sound" onclick="toggleSound()" style="cursor:pointer;font-weight:700;color:#4a9eff">${AppData.settings.notifications.sound ? 'On' : 'Off'}</span></div>
              <div style="font-size:14px;opacity:0.95">Vibrate: <span id="ctrl-vibrate" onclick="toggleVibrate()" style="cursor:pointer;font-weight:700;color:#4a9eff">${AppData.settings.notifications.vibrate ? 'On' : 'Off'}</span></div>
              <button class="resolve-btn" onclick="playSampleSound()">Play Sample</button>
            </div>
            <div id="alarmListContainer"></div>
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
              <button class="resolve-btn" onclick="addAlarm()">Add Alarm</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
      }
      overlay.classList.add('active');
      editingAlarmId = null;
      renderAlarmPanel();
    }

    function closeAlarmPanel() {
      const overlay = document.getElementById('alarmOverlay');
      if (overlay) overlay.classList.remove('active');
    }

    function renderAlarmPanel() {
      const container = document.getElementById('alarmListContainer');
      if (!container) return;
      if (!AppData.alarms || AppData.alarms.length === 0) {
        container.innerHTML = '<p class="no-events">No alarms. Click Add Alarm to create one.</p>';
        return;
      }

      container.innerHTML = AppData.alarms.map(a => {
        if (editingAlarmId === a.id) {
          return `
            <div class="alarm-row">
              <div class="left">
                <input type="time" id="edit-time-${a.id}" value="${a.time}">
                <input type="text" id="edit-label-${a.id}" value="${escapeHtml(a.label)}">
              </div>
              <div class="alarm-actions">
                <button class="resolve-btn" onclick="saveEditAlarm(${a.id})">Save</button>
                <button class="resolve-btn" onclick="cancelEditAlarm()">Cancel</button>
              </div>
            </div>`;
        }

        return `
          <div class="alarm-row">
            <div class="left">
              <div style="font-weight:700">${a.time}</div>
              <div style="opacity:0.85">${escapeHtml(a.label)}</div>
            </div>
            <div class="alarm-actions">
              <button class="resolve-btn" onclick="toggleAlarm(${a.id})">${a.enabled ? 'On' : 'Off'}</button>
              <button class="resolve-btn" onclick="startEditAlarm(${a.id})">Edit</button>
              <button class="resolve-btn" onclick="removeAlarm(${a.id})">Delete</button>
            </div>
          </div>`;
      }).join('');
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function startEditAlarm(id) {
      editingAlarmId = id;
      renderAlarmPanel();
    }

    function saveEditAlarm(id) {
      const timeEl = document.getElementById(`edit-time-${id}`);
      const labelEl = document.getElementById(`edit-label-${id}`);
      if (!timeEl || !labelEl) return;
      const a = AppData.alarms.find(x => x.id === id);
      if (!a) return;
      a.time = timeEl.value;
      a.label = labelEl.value;
      editingAlarmId = null;
      renderAlarmPanel();
      saveAppDataToStorage();
    }

    function cancelEditAlarm() {
      editingAlarmId = null;
      renderAlarmPanel();
    }

    function addAlarm() {
      const time = prompt('Alarm time (HH:MM)', '09:00');
      if (!time) return;
      const label = prompt('Label for alarm', 'New Alarm') || 'Alarm';
      const id = Date.now();
      AppData.alarms.push({ id, time, label, enabled: true });
      renderAlarmPanel();
      saveAppDataToStorage();
    }

    function removeAlarm(id) {
      AppData.alarms = AppData.alarms.filter(a => a.id !== id);
      renderAlarmPanel();
      saveAppDataToStorage();
    }

    function toggleAlarm(id) {
      const a = AppData.alarms.find(x => x.id === id);
      if (!a) return;
      a.enabled = !a.enabled;
      renderAlarmPanel();
      saveAppDataToStorage();
    }

    document.getElementById('profileIcon').addEventListener('click', () => {
      window.location.href = 'account.html';
    });

    // Global handlers: Escape to close overlays and click-outside to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAlarmPanel();
        const f = document.getElementById('firingOverlay');
        if (f) { f.classList.remove('active'); stopAlarmSound(); }
      }
    });

    document.addEventListener('click', (e) => {
      // if user clicks on the overlay background (not the panel), close it
      if (e.target && e.target.id === 'alarmOverlay') closeAlarmPanel();
      if (e.target && e.target.id === 'firingOverlay') { dismissFiringAlarm(); }
    });

    window.addEventListener('DOMContentLoaded', renderPage);

/* =========================
   Hardcoded initial data
   ========================= */
let events = [
  {
    id: 1,
    kind: 'event',
    category: 'school',
    type: 'school',
    title: 'IT 321',
    fullTitle: 'Human-Computer Interaction',
    location: 'Online',
    startDate: '2025-12-06',
    startTime: '10:00',
    endDate: '2025-12-06',
    endTime: '13:30',
    priority: 'medium',
    reminder: '10m',
    completed: false
  },
  {
    id: 2,
    kind: 'event',
    category: 'school',
    type: 'school',
    title: 'CS 311',
    fullTitle: 'Automata Theory and Formal Languages',
    location: 'Online',
    startDate: '2025-10-23',
    startTime: '07:00',
    endDate: '2025-10-23',
    endTime: '08:30',
    priority: 'medium',
    reminder: '30m',
    completed: false
  },
  {
    id: 3,
    kind: 'event',
    category: 'school',
    type: 'school',
    title: 'GEd 104',
    fullTitle: 'The Contemporary World',
    location: 'Online',
    startDate: '2025-10-23',
    startTime: '07:00',
    endDate: '2025-10-23',
    endTime: '08:30',
    priority: 'medium',
    reminder: '30m',
    completed: false
  },
  {
    id: 4,
    kind: 'event',
    category: 'school',
    type: 'school',
    title: 'IT 314',
    fullTitle: 'Web Systems and Technologies',
    location: 'Online',
    startDate: '2025-10-23',
    startTime: '13:00',
    endDate: '2025-10-23',
    endTime: '16:00',
    priority: 'medium',
    reminder: '30m',
    completed: false
  },
  {
    id: 5,
    kind: 'event',
    category: 'school',
    type: 'school',
    title: 'IT 331',
    fullTitle: 'Application Development and Emerging Technologies',
    location: 'Online',
    startDate: '2025-10-24',
    startTime: '07:00',
    endDate: '2025-10-24',
    endTime: '10:00',
    priority: 'medium',
    reminder: '30m',
    completed: false
  },
  {
    id: 6,
    kind: 'event',
    category: 'school',
    type: 'school',
    title: 'CS 312',
    fullTitle: 'Mobile Computing',
    location: 'Online',
    startDate: '2025-10-24',
    startTime: '07:00',
    endDate: '2025-10-24',
    endTime: '08:30',
    priority: 'medium',
    reminder: '30m',
    completed: false
  },
  {
    id: 7,
    kind: 'event',
    category: 'personal',
    type: 'personal',
    title: 'Dental Appointment',
    fullTitle: 'Dental Appointment',
    location: 'Dental Clinic',
    startDate: '2025-10-24',
    startTime: '14:00',
    endDate: '2025-10-24',
    endTime: '15:00',
    priority: 'low',
    reminder: '1d',
    completed: false
  },
  {
    id: 8,
    kind: 'task',
    category: 'school',
    type: 'school',
    title: 'Submit IT 321 report',
    fullTitle: 'Submit final report for HCI',
    location: 'Online',
    startDate: '2025-12-05',
    startTime: '23:59',
    endDate: '2025-12-05',
    endTime: '23:59',
    priority: 'high',
    reminder: '1d',
    completed: false
  },
  {
    id: 9,
    kind: 'task',
    category: 'personal',
    type: 'personal',
    title: 'Buy groceries',
    fullTitle: 'Groceries: milk, eggs, bread',
    location: 'Grocery Store',
    startDate: '2025-12-07',
    startTime: '10:00',
    endDate: '2025-12-07',
    endTime: '11:00',
    priority: 'low',
    reminder: 'none',
    completed: true
  },
  {
    id: 10,
    kind: 'event',
    category: 'work',
    type: 'work',
    title: 'Team Meeting',
    fullTitle: 'Weekly sync meeting',
    location: 'Office',
    startDate: '2025-12-08',
    startTime: '10:00',
    endDate: '2025-12-08',
    endTime: '11:00',
    priority: 'high',
    reminder: '30m',
    completed: false
  }
];

/* =========================
   App state
   ========================= */
let state = {
  filter: 'all',
  sort: 'date',
  editingId: null
}

/* =========================
   DOM helpers & render
   ========================= */

const plannerList = document.getElementById('plannerList');
const notificationPanel = document.getElementById('notificationPanel');
const notificationList = document.getElementById('notificationList');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const itemForm = document.getElementById('itemForm');
const deleteModal = document.getElementById('deleteModal');

function getIconForCategory(category) {
  switch(category) {
    case 'school': return 'fa-graduation-cap';
    case 'work': return 'fa-briefcase';
    case 'personal': return 'fa-user';
    default: return 'fa-circle';
  }
}

function formatDate(dateStr){
  if(!dateStr) return '';
  const d = new Date(dateStr + 'T00:00');
  return d.toLocaleDateString('en-GB');
}

function daysUntil(dateStr){
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00');
  const diff = Math.ceil((d - today)/(1000*60*60*24));
  return diff;
}

function getBadgeForEvent(e){
  const diffDays = daysUntil(e.startDate);
  if(e.kind === 'event' && diffDays <= 0 && diffDays >= -1){
    return {text: 'Ends soon', cls:'ending-soon'};
  } else if(diffDays === 0){
    return {text:'Today', cls:'ending-soon'};
  } else if(diffDays === 1){
    return {text:'Tomorrow', cls:'tomorrow'};
  } else if(diffDays > 1 && diffDays <=7){
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = new Date(e.startDate).getDay();
    return {text: dayNames[dayName], cls: 'dayname'};
  } else {
    return {text: formatDate(e.startDate), cls:'dayname'};
  }
}

function renderTodayPanel(){
  const now = new Date();
  now.setHours(0,0,0,0);
  const in7days = new Date();
  in7days.setDate(now.getDate() + 7);

  const items = events.filter(ev=>{
    const start = new Date(ev.startDate + 'T00:00');
    const isToday = start.getTime() === now.getTime();
    const isOverdue = !ev.completed && start < now;
    const isUpcoming7 = start > now && start <= in7days;
    return isToday || isOverdue || isUpcoming7;
  }).sort((a,b)=> new Date(a.startDate + 'T' + (a.startTime||'00:00')) - new Date(b.startDate + 'T' + (b.startTime||'00:00')) );

  if(items.length === 0){
    notificationList.innerHTML = '<div class="notification-item">No tasks/events for today or upcoming.</div>';
    return;
  }

  notificationList.innerHTML = items.map((ev,i)=>{
    let badgeText='';
    let badgeClass='';
    const start = new Date(ev.startDate + 'T00:00');
    const diffDays = Math.ceil((start - now)/(1000*60*60*24));
    if(!ev.completed && start < now) {
      badgeText = 'Overdue';
      badgeClass = 'overdue';
    } else if(diffDays === 0) {
      badgeText = 'Today';
      badgeClass = 'today';
    } else if(diffDays === 1) {
      badgeText = 'Tomorrow';
      badgeClass = 'current';
    } else if(diffDays > 1 && diffDays <=7){
      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      badgeText = dayNames[start.getDay()];
      badgeClass = 'current';
    }

    return `<div class="notification-item ${badgeClass}">
      <strong>${ev.title} ${badgeText ? '('+badgeText+')' : ''}</strong><br>
      <small>${ev.fullTitle || ''} • ${ev.startTime || '—'} - ${ev.endTime || '—'}</small>
    </div>`;
  }).join('');
}

function renderNotifications(){
  renderTodayPanel();
}

function updateSectionHeader(filter) {
  const titleEl = document.getElementById("sectionTitle");
  const iconEl = document.getElementById("sectionIcon");

  let title = "Items";
  let icon = "fa-layer-group";

  switch (filter) {
    case "all":
      title = "All";
      icon = "fa-layer-group";
      break;

    case "all-tasks":
      title = "All Tasks";
      icon = "fa-list-check";
      break;

    case "all-events":
      title = "All Events";
      icon = "fa-calendar";
      break;

    case "current":
      title = "Current";
      icon = "fa-clock";
      break;

    case "current-tasks":
      title = "Current Tasks";
      icon = "fa-list-check";
      break;

    case "current-events":
      title = "Current Events";
      icon = "fa-calendar";
      break;

    case "missed":
      title = "Missed";
      icon = "fa-triangle-exclamation";
      break;

    case "missed-tasks":
      title = "Missed Tasks";
      icon = "fa-list-check";
      break;

    case "missed-events":
      title = "Missed Events";
      icon = "fa-calendar-xmark";
      break;

    case "completed":
      title = "Completed Items";
      icon = "fa-check-circle";
      break;

    case "completed-tasks":
      title = "Completed Tasks";
      icon = "fa-check";
      break;

    case "completed-events":
      title = "Completed Events";
      icon = "fa-calendar-check";
      break;
  }

  titleEl.textContent = title;

  // Reset classes first
  iconEl.className = "fas " + icon;
}


function renderPlanner(){
  let items = [...events];
  
  const now = new Date();
  now.setHours(0,0,0,0);
  
  if(state.filter === 'all'){
  } else if(state.filter === 'all-tasks'){
    items = items.filter(i => i.kind === 'task');
  } else if(state.filter === 'all-events'){
    items = items.filter(i => i.kind === 'event');
  } else if(state.filter === 'current'){
    items = items.filter(i => !i.completed);
  } else if(state.filter === 'current-tasks'){
    items = items.filter(i => !i.completed && i.kind === 'task');
  } else if(state.filter === 'current-events'){
    items = items.filter(i => !i.completed && i.kind === 'event');
  } else if(state.filter === 'missed'){
    items = items.filter(i => !i.completed && new Date(i.startDate + 'T00:00') < now);
  } else if(state.filter === 'missed-tasks'){
    items = items.filter(i => !i.completed && i.kind === 'task' && new Date(i.startDate + 'T00:00') < now);
  } else if(state.filter === 'missed-events'){
    items = items.filter(i => !i.completed && i.kind === 'event' && new Date(i.startDate + 'T00:00') < now);
  } else if(state.filter === 'completed'){
    items = items.filter(i => i.completed);
  } else if(state.filter === 'completed-tasks'){
    items = items.filter(i => i.completed && i.kind === 'task');
  } else if(state.filter === 'completed-events'){
    items = items.filter(i => i.completed && i.kind === 'event');
  }

  items.sort((a,b)=>{
    if(a.completed !== b.completed) return a.completed ? 1 : -1;
    const da = new Date((a.startDate||'1970-01-01') + 'T' + (a.startTime||'00:00'));
    const db = new Date((b.startDate||'1970-01-01') + 'T' + (b.startTime||'00:00'));
    return da - db;
  });

  const grouped = {};
  items.forEach(item => {
    const date = new Date(item.startDate + 'T00:00');
    const monthKey = date.toLocaleDateString('en-GB', {month: 'long', year: 'numeric'});
    if(!grouped[monthKey]) grouped[monthKey] = [];
    grouped[monthKey].push(item);
  });

  if(items.length === 0){
    plannerList.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(255,255,255,0.5)">No items found.</div>';
    return;
  }

  let html = '';
  Object.keys(grouped).forEach(monthKey => {
    html += `<div style="grid-column:1/-1;padding:12px 0;margin-top:10px;border-bottom:1px solid rgba(255,255,255,0.1);"><h2 style="font-size:16px;opacity:0.8">${monthKey}</h2></div>`;
    grouped[monthKey].forEach(ev => {
      const badge = getBadgeForEvent(ev);
      const indicatorColor = ev.category === 'personal' ? '#9b59b6' : ev.category === 'work' ? '#1d9a66' : '#4a9eff';
      const typeIcon = ev.kind === 'task' ? 'fa-list-check' : getIconForCategory(ev.category);
      const typeName = ev.kind === 'task' ? 'Task' : 'Event';
      const completedCls = ev.completed ? 'completed' : '';
      html += `<div class="event-item ${ev.category} ${completedCls}" data-id="${ev.id}">
        <div class="event-header">
          <div style="display:flex;gap:10px;align-items:center">
            <div class="event-indicator" style="background:${indicatorColor}"></div>
            <div>
              <h3 style="margin:0">${ev.title}</h3>
              <div class="muted small">${ev.fullTitle || ''}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div class="event-badge ${badge.cls}" title="Date">${badge.text}</div>
          </div>
        </div>

        <div class="event-details">
          <p><i class="fas ${typeIcon}"></i> ${typeName} • <strong>${ev.category}</strong></p>
          <p><i class="fas fa-map-marker-alt"></i> ${ev.location || '—'}</p>
          <p class="event-time"><i class="far fa-calendar"></i> ${formatDate(ev.startDate)} <br><i class="far fa-clock"></i> ${ev.startTime || '—'} - ${ev.endTime || '—'}</p>
        </div>

        <div class="event-actions">
          <button class="action-btn edit" data-id="${ev.id}" title="Edit"><i class="fas fa-edit"></i> Edit</button>
          <button class="action-btn delete" data-id="${ev.id}" title="Delete"><i class="fas fa-trash"></i> Delete</button>
          <button class="action-btn" data-complete="${ev.id}" title="Toggle complete" style="background:rgba(255,255,255,0.03);color:#fff">
            <i class="fas ${ev.completed ? 'fa-check-circle' : 'fa-circle'}"></i> ${ev.completed ? 'Completed' : 'Mark'}
          </button>
        </div>
      </div>`;
    });
  });
  plannerList.innerHTML = html;

  document.querySelectorAll('.action-btn.edit').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = Number(btn.dataset.id);
      openOverlay('edit', id);
    });
  });
  document.querySelectorAll('.action-btn.delete').forEach(btn=>{
    btn.addEventListener('click', ()=> {
      const id = Number(btn.dataset.id);
      openDeleteConfirm(id);
    });
  });
  document.querySelectorAll('.event-actions [data-complete]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = Number(btn.getAttribute('data-complete'));
      toggleComplete(id);
    });
  });
}


/* =========================
   CRUD-ish in-memory actions
   ========================= */
function nextId(){
  return Math.max(0,...events.map(e=>e.id)) + 1;
}

function addItem(payload){
  payload.id = nextId();
  events.push(payload);
  renderPlanner();
  renderNotifications();
}

function updateItem(id, payload){
  const idx = events.findIndex(e => e.id === id);
  if(idx !== -1){
    events[idx] = {...events[idx], ...payload};
    renderPlanner();
    renderNotifications();
  }
}

function deleteItem(id){
  events = events.filter(e => e.id !== id);
  closeDeleteConfirm();
  renderPlanner();
  renderNotifications();
}

function toggleComplete(id){
  const ev = events.find(e=>e.id===id);
  if(ev){
    ev.completed = !ev.completed;
    renderPlanner();
    renderNotifications();
  }
}

/* =========================
   Delete confirm modal
   ========================= */
let pendingDeleteId = null;
function openDeleteConfirm(id){
  pendingDeleteId = id;
  deleteModal.classList.add('active');
}
document.getElementById('cancelDelete').addEventListener('click', closeDeleteConfirm);
document.getElementById('confirmDelete').addEventListener('click', ()=>{ if(pendingDeleteId) deleteItem(pendingDeleteId); });
function closeDeleteConfirm(){ pendingDeleteId = null; deleteModal.classList.remove('active'); }

/* =========================
   Overlay (Add/Edit) behavior
   ========================= */
const openAddBtn = document.getElementById('openAdd');
const closeOverlayBtn = document.getElementById('closeOverlay');
const cancelFormBtn = document.getElementById('cancelForm');
const btnTypeEls = document.querySelectorAll('.btnType');

openAddBtn.addEventListener('click', ()=> openOverlay('add'));
closeOverlayBtn.addEventListener('click', closeOverlay);
cancelFormBtn.addEventListener('click', closeOverlay);

btnTypeEls.forEach(b=>{
  b.addEventListener('click', ()=>{
    btnTypeEls.forEach(x=>x.classList.remove('primary'));
    b.classList.add('primary');
    document.querySelectorAll('.btnType').forEach(btn=>btn.classList.remove('primary'));
    b.classList.add('primary');
    setFormKind(b.dataset.type);
  });
});

function openOverlay(mode='add', id=null){
  state.editingId = (mode==='edit'?id:null);
  overlay.classList.add('active');
  overlayTitle.textContent = mode === 'add' ? 'Add item' : 'Edit item';
  itemForm.reset();
  document.querySelectorAll('.btnType').forEach(bt=>bt.classList.remove('primary'));
  if(mode === 'add'){
    document.querySelector('.btnType[data-type="event"]').classList.add('primary');
    setFormKind('event');
    document.getElementById('priorityLabel').style.display = 'none';
    document.getElementById('priority').style.display = 'none';
    const bt = document.getElementById('bulkToggle'); if(bt) bt.checked = false;
    const bo = document.getElementById('bulkOptions'); if(bo) bo.style.display = 'none';
  } else {
    const ev = events.find(x=>x.id === id);
    if(!ev) return;
    const typeBtn = document.querySelector(`.btnType[data-type="${ev.kind}"]`);
    if(typeBtn) typeBtn.classList.add('primary');
    setFormKind(ev.kind);

    document.getElementById('title').value = ev.title || '';
    document.getElementById('description').value = ev.fullTitle || '';
    document.getElementById('category').value = ev.category || 'school';
    document.getElementById('priority').value = ev.priority || 'medium';
    document.getElementById('reminder').value = ev.reminder || 'none';
    document.getElementById('repeat').value = ev.repeat || 'none';
    document.getElementById('startDate').value = ev.startDate || '';
    document.getElementById('startTime').value = ev.startTime || '';
    document.getElementById('endDate').value = ev.endDate || '';
    document.getElementById('endTime').value = ev.endTime || '';
    document.getElementById('mode').value = ev.mode || 'online';
    document.getElementById('completedFlag').checked = !!ev.completed;
    renderModeFields();
  }
}

function closeOverlay(){
  overlay.classList.remove('active');
  state.editingId = null;
}

function setFormKind(kind){
  const priorityLabel = document.getElementById('priorityLabel');
  const priorityEl = document.getElementById('priority');
  if(kind === 'task'){
    priorityLabel.style.display = 'block';
    priorityEl.style.display = 'block';
  } else {
    priorityLabel.style.display = 'none';
    priorityEl.style.display = 'none';
  }
}

document.getElementById('mode').addEventListener('change', renderModeFields);
function renderModeFields(){
  const mode = document.getElementById('mode').value;
  const container = document.getElementById('modeFields');
  container.innerHTML = '';
  if(mode === 'f2f'){
    container.innerHTML = `
      <label>Address</label>
      <input type="text" id="f2fAddress" placeholder="Building / Room / Full address (optional)">
      <button type="button" class="btn ghost" style="margin-top:8px" id="useSavedLocations">Use saved locations</button>
    `;
  } else if(mode === 'online'){
    container.innerHTML = `
      <label>Online link</label>
      <input type="text" id="onlineLink" placeholder="Google Meet / Zoom / Teams URL">
      <label style="margin-top:8px">Meeting password (optional)</label>
      <input type="text" id="onlinePass" placeholder="Password / code (optional)">
    `;
  } else if(mode === 'hybrid'){
    container.innerHTML = `
      <label>Address</label>
      <input type="text" id="f2fAddress" placeholder="Building / Room / Full address">
      <label style="margin-top:8px">Online link</label>
      <input type="text" id="onlineLink" placeholder="Zoom / Meet link">
    `;
  }
}

itemForm.addEventListener('submit', function(e){
  e.preventDefault();
  const kind = document.querySelector('.btnType.primary')?.dataset.type || 'event';
  const title = document.getElementById('title').value.trim();
  if(!title){ alert('Title is required'); return; }

  const isBulk = document.getElementById('bulkToggle')?.checked;

  if(!isBulk){
    const payload = {
      kind: kind,
      title: title,
      fullTitle: document.getElementById('description').value.trim(),
      category: document.getElementById('category').value,
      type: document.getElementById('category').value,
      priority: document.getElementById('priority').value,
      reminder: document.getElementById('reminder').value,
      repeat: document.getElementById('repeat').value,
      startDate: document.getElementById('startDate').value || '',
      startTime: document.getElementById('startTime').value || '',
      endDate: document.getElementById('endDate').value || '',
      endTime: document.getElementById('endTime').value || '',
      mode: document.getElementById('mode').value || 'online',
      location: (document.getElementById('mode').value==='f2f') ? (document.getElementById('f2fAddress')?.value || '') : (document.getElementById('onlineLink')?.value || '') ,
      completed: document.getElementById('completedFlag').checked
    };

    if(state.editingId){
      updateItem(state.editingId, payload);
    } else {
      addItem(payload);
    }
    closeOverlay();
    return;
  }

  const semStartStr = document.getElementById('semStart')?.value;
  const semEndStr = document.getElementById('semEnd')?.value;
  if(!semStartStr || !semEndStr){ alert('Please provide semester start and end dates'); return; }
  const semStart = new Date(semStartStr + 'T00:00');
  const semEnd = new Date(semEndStr + 'T00:00');
  if(semEnd < semStart){ alert('Semester end must be after start'); return; }

  const days = ['mon','tue','wed','thu','fri'];
  const weekA = {};
  const weekB = {};
  days.forEach(d=>{
    weekA[d] = document.getElementById('weekA_'+d)?.value || 'none';
    weekB[d] = document.getElementById('weekB_'+d)?.value || 'none';
  });

  const base = {
    kind: kind,
    title: title,
    fullTitle: document.getElementById('description').value.trim(),
    category: document.getElementById('category').value,
    type: document.getElementById('category').value,
    priority: document.getElementById('priority').value,
    reminder: document.getElementById('reminder').value,
    repeat: document.getElementById('repeat').value,
    startTime: document.getElementById('startTime').value || '',
    endTime: document.getElementById('endTime').value || '',
    completed: document.getElementById('completedFlag').checked
  };

  const MAX_EVENTS = 500;
  let created = 0;

  const msPerDay = 24*60*60*1000;
  let cur = new Date(semStart.getTime());
  while(cur <= semEnd){
    const dow = cur.getDay();
    if(dow >= 1 && dow <=5){
      const weekOffset = Math.floor((cur - semStart) / (7*msPerDay));
      const template = (weekOffset % 2 === 0) ? weekA : weekB;
      const dayKey = days[dow-1];
      const modeForDay = template[dayKey];
      if(modeForDay && modeForDay !== 'none'){
        const payload = Object.assign({}, base);
        payload.startDate = cur.toISOString().slice(0,10);
        payload.endDate = payload.startDate;
        payload.mode = modeForDay;
        payload.location = (modeForDay === 'f2f') ? (document.getElementById('f2fAddress')?.value || '') : (document.getElementById('onlineLink')?.value || '');

        addItem(payload);
        created++;
        if(created >= MAX_EVENTS){
          alert('Reached maximum allowed events ('+MAX_EVENTS+'). Import stopped.');
          break;
        }
      }
    }
    cur = new Date(cur.getTime() + msPerDay);
  }

  alert('Created '+created+' events for the semester.');
  closeOverlay();
});

/* =========================
   Filters & UI wiring
   ========================= */
document.getElementById('filterSelect').addEventListener('change', function(e){
  state.filter = e.target.value;
  updateSectionHeader(state.filter);
  renderPlanner();
});

document.getElementById('notifBtn').addEventListener('click', ()=>{
  notificationPanel.classList.toggle('active');
});

document.addEventListener('click', (e)=>{
  const panel = document.getElementById('notificationPanel');
  const btn = document.getElementById('notifBtn');
  if(panel.classList.contains('active') && !panel.contains(e.target) && !btn.contains(e.target)){
    panel.classList.remove('active');
  }
});

document.getElementById('profileIcon').addEventListener('click', ()=>{
  window.location.href = 'account.html';
});

renderNotifications();
renderPlanner();
renderModeFields();

const bulkToggleEl = document.getElementById('bulkToggle');
if(bulkToggleEl){
  bulkToggleEl.addEventListener('change', (e)=>{
    const box = document.getElementById('bulkOptions');
    if(!box) return;
    box.style.display = e.target.checked ? 'block' : 'none';
  });
}

/* ========================= */
/* Import schedule functionality */
/* ========================= */
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const importModal = document.getElementById('importModal');
const selectImportFileBtn = document.getElementById('selectImportFile');
const cancelImportBtn = document.getElementById('cancelImport');

importBtn.addEventListener('click', () => {
  importModal.classList.add('active');
});

selectImportFileBtn.addEventListener('click', () => {
  importFile.click();
});

cancelImportBtn.addEventListener('click', () => {
  importModal.classList.remove('active');
});

importFile.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      let data = [];
      
      if (file.name.endsWith('.json')) {
        data = JSON.parse(event.target.result);
      } else if (file.name.endsWith('.csv')) {
        data = parseCSV(event.target.result);
      }

      if (!Array.isArray(data) || data.length === 0) {
        alert('Invalid file format. Please provide a valid JSON or CSV file.');
        return;
      }

      let importedCount = 0;
      data.forEach(item => {
        if (item.title) {
          const payload = {
            kind: item.kind || 'event',
            title: item.title,
            fullTitle: item.fullTitle || '',
            category: item.category || 'school',
            type: item.type || item.category || 'school',
            priority: item.priority || 'medium',
            reminder: item.reminder || 'none',
            repeat: item.repeat || 'none',
            startDate: item.startDate || '',
            startTime: item.startTime || '',
            endDate: item.endDate || '',
            endTime: item.endTime || '',
            mode: item.mode || 'online',
            location: item.location || '',
            completed: item.completed || false
          };
          addItem(payload);
          importedCount++;
        }
      });

      alert(`Successfully imported ${importedCount} events!`);
      importModal.classList.remove('active');
      importFile.value = '';
    } catch (error) {
      alert('Error parsing file: ' + error.message);
    }
  };
  reader.readAsText(file);
});

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] || '';
    });
    data.push(obj);
  }
  
  return data;
}

window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeOverlay(); });


    const AppData = {
      user: {
        firstName: 'Damian',
        lastName: 'Alvah',
        email: 'dalvah@gmail.com',
        accountCreated: '2025-10-01'
      },
      settings: {
        notifications: {
          enabled: true,
          sound: true,
          vibrate: true,
          defaultReminder: '1 hour before'
        },
        preferences: {
          defaultView: 'home.html',
          timeFormat: '12',
          dateFormat: 'mdy'
        }
      },
      conflicts: []
    };

    const STORAGE_KEY = 'planease_account_settings';

    window.addEventListener('DOMContentLoaded', () => {
      loadSettings();
      renderPage();
    });

    function loadSettings() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          AppData.user = { ...AppData.user, ...data.user };
          AppData.settings = { ...AppData.settings, ...data.settings };
        }
      } catch (e) {
        console.warn('Failed to load settings', e);
      }
    }

    function saveSettings() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          user: AppData.user,
          settings: AppData.settings
        }));
      } catch (e) {
        console.warn('Failed to save settings', e);
      }
    }

    function renderPage() {
      renderHeader();
      renderProfile();
      renderSettings();
      renderNotifications();
    }

    function renderHeader() {
      document.getElementById('profileInitial').textContent = AppData.user.firstName.charAt(0);
      const hasConflicts = AppData.conflicts && AppData.conflicts.length > 0;
      document.getElementById('notificationDot').style.display = hasConflicts ? 'block' : 'none';
    }

    function renderProfile() {
      const user = AppData.user;
      document.getElementById('profileInitialLarge').textContent = user.firstName.charAt(0);
      document.getElementById('profileName').textContent = `${user.firstName} ${user.lastName}`;
      document.getElementById('profileEmail').textContent = user.email;
      const date = new Date(user.accountCreated);
      const formatted = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      document.getElementById('accountCreated').textContent = `Account Created ${formatted}`;
    }

    function renderSettings() {
      const notifToggle = document.getElementById('notifToggle');
      if (AppData.settings.notifications.enabled) {
        notifToggle.classList.add('active');
      } else {
        notifToggle.classList.remove('active');
      }
      document.getElementById('reminderTime').textContent = AppData.settings.notifications.defaultReminder;
      
      const types = [];
      if (AppData.settings.notifications.sound) types.push('Sound');
      if (AppData.settings.notifications.vibrate) types.push('Vibrate');
      document.getElementById('reminderType').textContent = types.length > 0 ? types.join(' & ') : 'None';

      // Update preference displays
      const viewMap = {
        'home.html': 'Home',
        'calendar.html': 'Calendar',
        'planner.html': 'Planner',
        'account.html': 'Account'
      };
      document.getElementById('defaultViewText').textContent = viewMap[AppData.settings.preferences.defaultView] || 'Home';

      const timeFormat = AppData.settings.preferences.timeFormat === '24' ? '24-hour (22:00)' : '12-hour (10:00 PM)';
      document.getElementById('timeFormatText').textContent = timeFormat;

      const dateFormatMap = {
        'mdy': 'Month DD, YYYY (December 09, 2025)',
        'dmy': 'DD Month YYYY (09 December 2025)',
        'ymd': 'YYYY-MM-DD (2025-12-09)',
        'short': 'MM/DD/YYYY (12/09/2025)'
      };
      document.getElementById('dateFormatText').textContent = dateFormatMap[AppData.settings.preferences.dateFormat] || dateFormatMap.mdy;
    }
    
    function toggleSetting(key) {
      const keys = key.split('.');
      let setting = AppData.settings;
      for (let i = 0; i < keys.length - 1; i++) {
        setting = setting[keys[i]];
      }
      setting[keys[keys.length - 1]] = !setting[keys[keys.length - 1]];
      
      saveSettings();
      showSuccess('Settings Updated', 'Your notification settings have been saved.');
      renderSettings();
    }

    function toggleSection(header) {
      header.classList.toggle('expanded');
      const content = header.nextElementSibling;
      if (content.style.maxHeight) {
        content.style.maxHeight = null;
      } else {
        content.style.maxHeight = content.scrollHeight + "px";
      }
    }
    
    function renderNotifications() {
      const container = document.getElementById('notificationList');
      const conflicts = AppData.conflicts || [];
      container.innerHTML = '';

      if (conflicts.length === 0) {
        container.innerHTML = '<div class="notification-item">No new notifications</div>';
        return;
      }

      conflicts.forEach(conflict => {
        container.innerHTML += `
          <div class="notification-item unread">
            <strong>${conflict.title}</strong><br>
            <small>${conflict.description}</small>
          </div>
        `;
      });
    }

    function toggleNotifications() {
      document.getElementById('notificationPanel').classList.toggle('active');
    }

    function changeProfilePicture() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const profileImg = document.getElementById('profileImage');
            const headerImg = document.getElementById('profileIconImg');
            if (profileImg) {
              profileImg.src = event.target.result;
              profileImg.style.display = 'block';
              document.getElementById('profileInitialLarge').style.display = 'none';
            }
            if (headerImg) {
              headerImg.src = event.target.result;
              headerImg.style.display = 'block';
              document.getElementById('profileInitial').style.display = 'none';
            }
            showSuccess('Profile Picture Updated', 'Your profile picture has been changed successfully!');
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }

    // Modal functions
    function openEditProfileModal() {
      document.getElementById('editFirstName').value = AppData.user.firstName;
      document.getElementById('editLastName').value = AppData.user.lastName;
      document.getElementById('editEmail').value = AppData.user.email;
      document.getElementById('editProfileModal').classList.add('active');
    }

    function saveProfile() {
      const firstName = document.getElementById('editFirstName').value.trim();
      const lastName = document.getElementById('editLastName').value.trim();
      const email = document.getElementById('editEmail').value.trim();

      if (!firstName || !lastName || !email) {
        alert('Please fill in all fields');
        return;
      }

      if (!email.includes('@')) {
        alert('Please enter a valid email address');
        return;
      }

      AppData.user.firstName = firstName;
      AppData.user.lastName = lastName;
      AppData.user.email = email;

      saveSettings();
      renderProfile();
      renderHeader();
      closeModal('editProfileModal');
      showSuccess('Profile Updated', 'Your profile information has been saved successfully!');
    }

    function openChangePasswordModal() {
      document.getElementById('changePasswordModal').classList.add('active');
    }

    function openManageAccountModal() {
      const user = AppData.user;
      document.getElementById('modalEmail').textContent = user.email;
      const date = new Date(user.accountCreated);
      const formatted = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      document.getElementById('modalCreated').textContent = formatted;
      document.getElementById('manageAccountModal').classList.add('active');
    }

    function openReminderTimeModal() {
      const currentValue = AppData.settings.notifications.defaultReminder;
      document.getElementById('reminderTimeSelect').value = currentValue;
      document.getElementById('reminderTimeModal').classList.add('active');
    }

    function openReminderTypeModal() {
      document.getElementById('soundCheck').checked = AppData.settings.notifications.sound;
      document.getElementById('vibrateCheck').checked = AppData.settings.notifications.vibrate;
      document.getElementById('reminderTypeModal').classList.add('active');
    }

    function openDefaultViewModal() {
      document.getElementById('defaultViewSelect').value = AppData.settings.preferences.defaultView;
      document.getElementById('defaultViewModal').classList.add('active');
    }

    function openTimeFormatModal() {
      document.getElementById('timeFormatSelect').value = AppData.settings.preferences.timeFormat;
      document.getElementById('timeFormatModal').classList.add('active');
    }

    function openDateFormatModal() {
      document.getElementById('dateFormatSelect').value = AppData.settings.preferences.dateFormat;
      document.getElementById('dateFormatModal').classList.add('active');
    }

    function openLogoutModal() {
      document.getElementById('logoutModal').classList.add('active');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.remove('active');
    }

    function savePassword() {
      const current = document.getElementById('currentPassword').value;
      const newPass = document.getElementById('newPassword').value;
      const confirm = document.getElementById('confirmPassword').value;

      if (!current || !newPass || !confirm) {
        alert('Please fill in all fields');
        return;
      }

      if (newPass !== confirm) {
        alert('New passwords do not match');
        return;
      }

      if (newPass.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
      }

      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
      closeModal('changePasswordModal');
      showSuccess('Password Changed', 'Your password has been updated successfully!');
    }

    function saveReminderTime() {
      const value = document.getElementById('reminderTimeSelect').value;
      AppData.settings.notifications.defaultReminder = value;
      saveSettings();
      renderSettings();
      closeModal('reminderTimeModal');
      showSuccess('Reminder Time Updated', `Default reminder time set to: ${value}`);
    }

    function saveReminderType() {
      const sound = document.getElementById('soundCheck').checked;
      const vibrate = document.getElementById('vibrateCheck').checked;
      AppData.settings.notifications.sound = sound;
      AppData.settings.notifications.vibrate = vibrate;
      
      saveSettings();
      renderSettings();
      closeModal('reminderTypeModal');
      showSuccess('Reminder Type Updated', 'Your reminder preferences have been saved!');
    }

    function saveDefaultView() {
      const value = document.getElementById('defaultViewSelect').value;
      AppData.settings.preferences.defaultView = value;
      saveSettings();
      renderSettings();
      closeModal('defaultViewModal');
      showSuccess('Default View Updated', 'Your login page preference has been saved!');
    }

    function saveTimeFormat() {
      const value = document.getElementById('timeFormatSelect').value;
      AppData.settings.preferences.timeFormat = value;
      saveSettings();
      renderSettings();
      closeModal('timeFormatModal');
      showSuccess('Time Format Updated', 'Your time format preference has been saved!');
    }

    function saveDateFormat() {
      const value = document.getElementById('dateFormatSelect').value;
      AppData.settings.preferences.dateFormat = value;
      saveSettings();
      renderSettings();
      closeModal('dateFormatModal');
      showSuccess('Date Format Updated', 'Your date format preference has been saved!');
    }

    function confirmLogout() {
      closeModal('logoutModal');
      window.location.href = 'splash.html';
    }

    function showSuccess(title, message) {
      document.getElementById('successTitle').textContent = title;
      document.getElementById('successMessage').textContent = message;
      document.getElementById('successModal').classList.add('active');
    }

    document.addEventListener('click', function(e) {
      const panel = document.getElementById('notificationPanel');
      const notifBtn = document.querySelector('.notification-btn');
      if (panel.classList.contains('active') && 
          !panel.contains(e.target) && 
          !notifBtn.contains(e.target)) {
        panel.classList.remove('active');
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal.active');
        modals.forEach(modal => modal.classList.remove('active'));
      }
    });
