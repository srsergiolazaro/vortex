import './style.css'

// OS Detection & Command Switching
const commands = {
  unix: 'curl -fsSL https://qtex.sh/install.sh | bash',
  windows: 'irm https://qtex.sh/install.ps1 | iex'
}

const tabs = document.querySelectorAll('.os-tab')
const commandEl = document.getElementById('install-command')
const copyBtn = document.getElementById('copy-btn')

// Detect OS
function getOS() {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'windows'
  return 'unix'
}

// Switch command
function switchOS(os) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.os === os))
  if (commandEl) {
    commandEl.textContent = commands[os] || commands.unix
    // Add a small flash effect when switching
    commandEl.style.color = 'white'
    setTimeout(() => {
      commandEl.style.color = 'var(--secondary)'
    }, 200)
  }
}

// Init with detected OS
switchOS(getOS())

// Tab clicks
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    switchOS(tab.dataset.os)
  })
})

// Copy button
copyBtn?.addEventListener('click', async () => {
  const text = commandEl?.textContent || ''
  try {
    await navigator.clipboard.writeText(text)
    const originalText = copyBtn.textContent
    copyBtn.textContent = 'COPIED!'
    copyBtn.style.background = 'var(--secondary)'

    setTimeout(() => {
      copyBtn.textContent = originalText
      copyBtn.style.background = 'var(--accent)'
    }, 2000)
  } catch (e) {
    console.error('Copy failed:', e)
  }
})

// Intersection Observer for stagger animations (fallback for CSS if needed)
const observerOptions = {
  threshold: 0.1
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible')
    }
  })
}, observerOptions)

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el))
