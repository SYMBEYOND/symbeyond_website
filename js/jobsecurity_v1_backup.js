/* ═══════════════════════════════════════════════════════════════
   JOB SECURITY DASHBOARD v2 - RAW SERIAL STREAM
   Shows complete, unfiltered serial output from Job Security
   Built by John Thomas DuCrest Lock & Claude
   SYMBEYOND Framework - January 2026
   ═══════════════════════════════════════════════════════════════ */

// Supabase Configuration
const SUPABASE_URL = 'https://vhjootqiiwmfwrfbzbjp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zqzc5C27lJW1kP3xa4Yr3g_oR7rnezH';

// Initialize Supabase client
const jobSecurityDB = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State management
let state = {
  connected: false,
  paused: false,
  lineCount: 0,
  serialSubscription: null,
  allLines: [] // Store all lines for download
};

// DOM Elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  connectionText: document.getElementById('connectionText'),
  statusConnection: document.getElementById('statusConnection'),
  statusLastUpdate: document.getElementById('statusLastUpdate'),
  lineCount: document.getElementById('lineCount'),
  terminal: document.getElementById('terminal'),
  pauseBtn: document.getElementById('pauseBtn'),
  clearBtn: document.getElementById('clearBtn'),
  downloadBtn: document.getElementById('downloadBtn')
};

/* ═══════════════════════════════════════════════════════════════
   INITIALIZATION
   ═══════════════════════════════════════════════════════════════ */

async function initialize() {
  console.log('🚀 Job Security Dashboard v2 initializing...');
  
  // Set up event listeners
  elements.pauseBtn.addEventListener('click', togglePause);
  elements.clearBtn.addEventListener('click', clearTerminal);
  elements.downloadBtn.addEventListener('click', downloadLog);
  
  // Test connection
  await testConnection();
  
  // Load recent serial output
  await loadRecentLines();
  
  // Subscribe to real-time updates
  subscribeToSerial();
  
  console.log('✅ Dashboard initialized successfully');
}

/* ═══════════════════════════════════════════════════════════════
   CONNECTION MANAGEMENT
   ═══════════════════════════════════════════════════════════════ */

async function testConnection() {
  try {
    const { data, error } = await jobSecurityDB
      .from('serial_log')
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
   TERMINAL DISPLAY
   ═══════════════════════════════════════════════════════════════ */

async function loadRecentLines() {
  try {
    const { data, error } = await jobSecurityDB
      .from('serial_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    
    // Clear placeholder
    elements.terminal.innerHTML = '';
    
    // Display lines in correct order (oldest first)
    if (data && data.length > 0) {
      data.reverse().forEach(item => {
        addLineToTerminal(item, false);
      });
    } else {
      elements.terminal.innerHTML = '<div class="terminal-placeholder">⏳ Waiting for Job Security...</div>';
    }
    
  } catch (error) {
    console.error('Error loading serial log:', error);
    elements.terminal.innerHTML = '<div class="terminal-placeholder">❌ Error loading data</div>';
  }
}

function addLineToTerminal(item, animate = true) {
  // Remove placeholder if exists
  const placeholder = elements.terminal.querySelector('.terminal-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  const lineElement = document.createElement('div');
  lineElement.className = 'terminal-line';
  if (animate) lineElement.classList.add('terminal-line-fade-in');
  
  const timestamp = new Date(item.created_at);
  const timeStr = formatTime(timestamp);
  
  // Color-code special lines
  let lineClass = '';
  const text = item.line_text;
  
  if (text.includes('ERROR') || text.includes('FAIL')) {
    lineClass = 'terminal-error';
  } else if (text.includes('✅') || text.includes('SUCCESS') || text.includes('COMPLETE')) {
    lineClass = 'terminal-success';
  } else if (text.includes('⚠️') || text.includes('WARNING')) {
    lineClass = 'terminal-warning';
  } else if (text.includes('═══')) {
    lineClass = 'terminal-system';
  }
  
  lineElement.innerHTML = `
    <span class="terminal-timestamp">[${timeStr}]</span>
    <span class="terminal-text ${lineClass}">${escapeHtml(text)}</span>
  `;
  
  elements.terminal.appendChild(lineElement);
  
  // Update line count
  state.lineCount++;
  state.allLines.push({ timestamp: timeStr, text: text });
  elements.lineCount.textContent = state.lineCount;
  
  // Auto-scroll to bottom if not paused
  if (!state.paused) {
    elements.terminal.scrollTop = elements.terminal.scrollHeight;
  }
  
  // Limit to 1000 lines in DOM (keep older ones in allLines for download)
  const lines = elements.terminal.querySelectorAll('.terminal-line');
  if (lines.length > 1000) {
    lines[0].remove();
  }
  
  // Update last update time
  elements.statusLastUpdate.textContent = formatTimeAgo(timestamp);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ═══════════════════════════════════════════════════════════════
   USER CONTROLS
   ═══════════════════════════════════════════════════════════════ */

function togglePause() {
  state.paused = !state.paused;
  elements.pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  
  if (!state.paused) {
    elements.terminal.scrollTop = elements.terminal.scrollHeight;
  }
}

function clearTerminal() {
  elements.terminal.innerHTML = '<div class="terminal-placeholder">Terminal cleared - waiting for new data...</div>';
  state.lineCount = 0;
  elements.lineCount.textContent = '0';
  // Note: We keep allLines for download even after clearing display
}

function downloadLog() {
  if (state.allLines.length === 0) {
    alert('No data to download yet!');
    return;
  }
  
  // Create text file content
  let content = '═══════════════════════════════════════════════════════\n';
  content += 'JOB SECURITY - SERIAL OUTPUT LOG\n';
  content += `Downloaded: ${new Date().toLocaleString()}\n`;
  content += `Total Lines: ${state.allLines.length}\n`;
  content += '═══════════════════════════════════════════════════════\n\n';
  
  state.allLines.forEach(line => {
    content += `[${line.timestamp}] ${line.text}\n`;
  });
  
  // Create download
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `job_security_log_${formatDateForFilename()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log(`📥 Downloaded ${state.allLines.length} lines`);
}

/* ═══════════════════════════════════════════════════════════════
   REAL-TIME SUBSCRIPTION
   ═══════════════════════════════════════════════════════════════ */

function subscribeToSerial() {
  state.serialSubscription = jobSecurityDB
    .channel('serial-channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'serial_log'
      },
      (payload) => {
        console.log('📨 New serial line:', payload.new.line_text);
        if (!state.paused) {
          addLineToTerminal(payload.new, true);
        }
      }
    )
    .subscribe((status) => {
      console.log('Serial subscription status:', status);
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
  
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDateForFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}`;
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

// Update "time ago" every 10 seconds
setInterval(() => {
  if (state.allLines.length > 0) {
    const lastLine = state.allLines[state.allLines.length - 1];
    // Extract timestamp and update
    const lines = elements.terminal.querySelectorAll('.terminal-line');
    if (lines.length > 0) {
      const lastTimestamp = lines[lines.length - 1].querySelector('.terminal-timestamp');
      if (lastTimestamp) {
        const timeMatch = lastTimestamp.textContent.match(/\[([\d:]+)\]/);
        if (timeMatch) {
          // Create approximate date from time string
          const now = new Date();
          const [hours, minutes, seconds] = timeMatch[1].split(':');
          const lineDate = new Date(now);
          lineDate.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds));
          elements.statusLastUpdate.textContent = formatTimeAgo(lineDate);
        }
      }
    }
  }
}, 10000);

console.log('💙 Built by John Thomas DuCrest Lock & Claude | SYMBEYOND Framework');
console.log('🎨 Job Security Dashboard v2 - Raw Serial Stream');

