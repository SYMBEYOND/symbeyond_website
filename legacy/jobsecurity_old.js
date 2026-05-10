/* ═══════════════════════════════════════════════════════════════
   JOB SECURITY DASHBOARD - REAL-TIME MONITORING
   Built by John Thomas DuCrest Lock & Claude
   SYMBEYOND Framework - December 2025
   ═══════════════════════════════════════════════════════════════ */

// Supabase Configuration
const SUPABASE_URL = 'https://vhjootqiiwmfwrfbzbjp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zqzc5C27lJW1kP3xa4Yr3g_oR7rnezH';

// Initialize Supabase client with unique name to avoid conflicts
const jobSecurityDB = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State management
let state = {
  connected: false,
  eventsPaused: false,
  latestTelemetry: null,
  eventSubscription: null,
  telemetrySubscription: null
};

// DOM Elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  connectionText: document.getElementById('connectionText'),
  statusConnection: document.getElementById('statusConnection'),
  statusState: document.getElementById('statusState'),
  statusPosition: document.getElementById('statusPosition'),
  statusFRAM: document.getElementById('statusFRAM'),
  statusUptime: document.getElementById('statusUptime'),
  statusLastUpdate: document.getElementById('statusLastUpdate'),
  yPos: document.getElementById('yPos'),
  zPos: document.getElementById('zPos'),
  framHealth: document.getElementById('framHealth'),
  eventStream: document.getElementById('eventStream'),
  telemetryGrid: document.getElementById('telemetryGrid'),
  pauseEventsBtn: document.getElementById('pauseEventsBtn'),
  clearEventsBtn: document.getElementById('clearEventsBtn')
};

/* ═══════════════════════════════════════════════════════════════
   INITIALIZATION
   ═══════════════════════════════════════════════════════════════ */

async function initialize() {
  console.log('🚀 Job Security Dashboard initializing...');
  
  // Set up event listeners
  elements.pauseEventsBtn.addEventListener('click', toggleEventsPause);
  elements.clearEventsBtn.addEventListener('click', clearEvents);
  
  // Test connection
  await testConnection();
  
  // Load initial data
  await loadInitialTelemetry();
  await loadRecentEvents();
  
  // Subscribe to real-time updates
  subscribeToEvents();
  subscribeToTelemetry();
  
  console.log('✅ Dashboard initialized successfully');
}

/* ═══════════════════════════════════════════════════════════════
   CONNECTION MANAGEMENT
   ═══════════════════════════════════════════════════════════════ */

async function testConnection() {
  try {
    const { data, error } = await jobSecurityDB
      .from('telemetry')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    
    updateConnectionStatus(true);
    console.log('✅ Connected to Supabase');
    
  } catch (error) {
    console.error('❌ Connection failed:', error);
    updateConnectionStatus(false);
  }
}

function updateConnectionStatus(connected) {
  state.connected = connected;
  
  if (connected) {
    elements.connectionStatus.classList.add('active');
    elements.connectionStatus.classList.remove('error');
    elements.connectionText.textContent = 'Job Security • LIVE';
    
    elements.statusConnection.innerHTML = `
      <span class="status-indicator status-online">●</span>
      <span>Connected</span>
    `;
  } else {
    elements.connectionStatus.classList.remove('active');
    elements.connectionStatus.classList.add('error');
    elements.connectionText.textContent = 'Disconnected';
    
    elements.statusConnection.innerHTML = `
      <span class="status-indicator status-offline">●</span>
      <span>Offline</span>
    `;
  }
}

/* ═══════════════════════════════════════════════════════════════
   TELEMETRY DATA
   ═══════════════════════════════════════════════════════════════ */

async function loadInitialTelemetry() {
  try {
    const { data, error } = await jobSecurityDB
      .from('telemetry')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) throw error;
    
    if (data) {
      updateTelemetryDisplay(data);
      loadTelemetryHistory();
    }
    
  } catch (error) {
    console.error('Error loading telemetry:', error);
  }
}

async function loadTelemetryHistory() {
  try {
    const { data, error } = await jobSecurityDB
      .from('telemetry')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    
    displayTelemetryHistory(data);
    
  } catch (error) {
    console.error('Error loading telemetry history:', error);
  }
}

function updateTelemetryDisplay(telemetry) {
  state.latestTelemetry = telemetry;
  
  // Update status
  const status = telemetry.status || 'UNKNOWN';
  const statusClass = status === 'RUNNING' ? 'status-online' : 
                      status === 'IDLE' ? 'status-initializing' : 'status-offline';
  
  elements.statusState.innerHTML = `
    <span class="status-indicator ${statusClass}">●</span>
    <span>${status}</span>
  `;
  
  // Update position
  elements.yPos.textContent = telemetry.y_position || 0;
  elements.zPos.textContent = telemetry.z_position || 0;
  
  // Update FRAM health
  const framHealth = telemetry.fram_health || 0;
  const framClass = framHealth > 50 ? 'status-online' : 
                    framHealth > 20 ? 'status-initializing' : 'status-offline';
  elements.framHealth.innerHTML = `
    <span class="status-indicator ${framClass}">●</span>
    <span>${framHealth}%</span>
  `;
  
  // Update uptime
  const uptime = telemetry.uptime_seconds || 0;
  elements.statusUptime.innerHTML = `<span>${formatUptime(uptime)}</span>`;
  
  // Update last update time
  const lastUpdate = new Date(telemetry.created_at);
  elements.statusLastUpdate.innerHTML = `<span>${formatTimeAgo(lastUpdate)}</span>`;
}

function displayTelemetryHistory(telemetryData) {
  if (!telemetryData || telemetryData.length === 0) {
    elements.telemetryGrid.innerHTML = '<div class="telemetry-placeholder">No telemetry data available</div>';
    return;
  }
  
  const html = telemetryData.map(item => {
    const time = new Date(item.created_at);
    return `
      <div class="telemetry-item">
        <div class="telemetry-time">${formatTime(time)}</div>
        <div class="telemetry-data">
          <div class="telemetry-field">
            <span class="telemetry-field-label">Status:</span>
            <span class="telemetry-field-value">${item.status || 'UNKNOWN'}</span>
          </div>
          <div class="telemetry-field">
            <span class="telemetry-field-label">Y:</span>
            <span class="telemetry-field-value">${item.y_position || 0}</span>
          </div>
          <div class="telemetry-field">
            <span class="telemetry-field-label">Z:</span>
            <span class="telemetry-field-value">${item.z_position || 0}</span>
          </div>
          <div class="telemetry-field">
            <span class="telemetry-field-label">FRAM:</span>
            <span class="telemetry-field-value">${item.fram_health || 0}%</span>
          </div>
          <div class="telemetry-field">
            <span class="telemetry-field-label">Uptime:</span>
            <span class="telemetry-field-value">${formatUptime(item.uptime_seconds || 0)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  elements.telemetryGrid.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════
   EVENT STREAM
   ═══════════════════════════════════════════════════════════════ */

async function loadRecentEvents() {
  try {
    const { data, error } = await jobSecurityDB
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    
    // Clear placeholder
    elements.eventStream.innerHTML = '';
    
    // Display events in reverse order (oldest first)
    if (data && data.length > 0) {
      data.reverse().forEach(event => {
        addEventToStream(event, false);
      });
    } else {
      elements.eventStream.innerHTML = '<div class="event-placeholder">No events yet</div>';
    }
    
  } catch (error) {
    console.error('Error loading events:', error);
    elements.eventStream.innerHTML = '<div class="event-placeholder">Error loading events</div>';
  }
}

function addEventToStream(event, animate = true) {
  // Remove placeholder if exists
  const placeholder = elements.eventStream.querySelector('.event-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  const eventElement = document.createElement('div');
  eventElement.className = 'event-item';
  if (!animate) eventElement.style.animation = 'none';
  
  const time = new Date(event.created_at);
  const eventType = event.event_type || 'SYSTEM';
  const typeClass = eventType.toLowerCase();
  
  eventElement.innerHTML = `
    <span class="event-timestamp">[${formatTime(time)}]</span>
    <span class="event-type ${typeClass}">${eventType}</span>
    <span class="event-message">${event.message}</span>
  `;
  
  elements.eventStream.appendChild(eventElement);
  
  // Auto-scroll to bottom if not paused
  if (!state.eventsPaused) {
    elements.eventStream.scrollTop = elements.eventStream.scrollHeight;
  }
  
  // Limit to 100 events
  const events = elements.eventStream.querySelectorAll('.event-item');
  if (events.length > 100) {
    events[0].remove();
  }
}

function toggleEventsPause() {
  state.eventsPaused = !state.eventsPaused;
  elements.pauseEventsBtn.textContent = state.eventsPaused ? 'Resume' : 'Pause';
  
  if (!state.eventsPaused) {
    elements.eventStream.scrollTop = elements.eventStream.scrollHeight;
  }
}

function clearEvents() {
  elements.eventStream.innerHTML = '<div class="event-placeholder">Event stream cleared</div>';
}

/* ═══════════════════════════════════════════════════════════════
   REAL-TIME SUBSCRIPTIONS
   ═══════════════════════════════════════════════════════════════ */

function subscribeToEvents() {
  state.eventSubscription = jobSecurityDB
    .channel('events-channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'events'
      },
      (payload) => {
        console.log('📨 New event:', payload.new);
        if (!state.eventsPaused) {
          addEventToStream(payload.new);
        }
      }
    )
    .subscribe((status) => {
      console.log('Events subscription status:', status);
    });
}

function subscribeToTelemetry() {
  state.telemetrySubscription = jobSecurityDB
    .channel('telemetry-channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'telemetry'
      },
      (payload) => {
        console.log('📊 New telemetry:', payload.new);
        updateTelemetryDisplay(payload.new);
        loadTelemetryHistory();
      }
    )
    .subscribe((status) => {
      console.log('Telemetry subscription status:', status);
    });
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   STARTUP
   ═══════════════════════════════════════════════════════════════ */

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Update "time ago" every 30 seconds
setInterval(() => {
  if (state.latestTelemetry) {
    const lastUpdate = new Date(state.latestTelemetry.created_at);
    elements.statusLastUpdate.innerHTML = `<span>${formatTimeAgo(lastUpdate)}</span>`;
  }
}, 30000);

console.log('💙 Built by John Thomas DuCrest Lock & Claude | SYMBEYOND Framework');
