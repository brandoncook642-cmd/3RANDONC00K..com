//scroll sections
window.onscroll = () => {
    //sticky header
    let header = document.querySelector('header');

    header.classList.toggle('sticky', window.scrollY > 100);
}

//menu icon
const menuIcon = document.querySelector('.menu-icon');
const navbar = document.querySelector('.navbar');
let vantaNet = null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (!prefersReducedMotion.matches) {
    document.body.classList.add('page-entering');
    const pageContent = [...document.body.children].find((element) =>
        element.tagName !== 'HEADER' &&
        element.tagName !== 'SCRIPT' &&
        element.id !== 'vanta-net'
    );

    const finishPageEntry = (event) => {
        if (event.target !== pageContent || event.animationName !== 'pageSlideInFromRight') {
            return;
        }

        document.body.classList.remove('page-entering');
        pageContent.removeEventListener('animationend', finishPageEntry);
    };

    if (pageContent) {
        pageContent.addEventListener('animationend', finishPageEntry);
    } else {
        document.body.classList.remove('page-entering');
    }

    let isNavigating = false;

    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');

        if (
            !link ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            link.target === '_blank' ||
            link.hasAttribute('download')
        ) {
            return;
        }

        const destination = new URL(link.href, window.location.href);
        const isInternalPage = destination.origin === window.location.origin &&
            destination.pathname !== window.location.pathname;

        if (!isInternalPage || isNavigating) {
            return;
        }

        event.preventDefault();
        isNavigating = true;
        document.body.classList.remove('page-entering');
        document.body.classList.add('page-leaving');

        const finishNavigation = (animationEvent) => {
            if (animationEvent.target !== pageContent || animationEvent.animationName !== 'pageSlideOutLeft') {
                return;
            }

            pageContent.removeEventListener('animationend', finishNavigation);
            window.location.assign(destination.href);
        };

        if (pageContent) {
            pageContent.addEventListener('animationend', finishNavigation);
        } else {
            window.location.assign(destination.href);
        }
    });
}

if (menuIcon && navbar) {
    menuIcon.addEventListener('click', () => {
        const isOpen = navbar.classList.toggle('open');
        menuIcon.setAttribute('aria-expanded', isOpen);
    });
}

document.querySelectorAll('[data-skills-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('.skills-grid');
    const previousButton = carousel.querySelector('[data-carousel-prev]');
    const nextButton = carousel.querySelector('[data-carousel-next]');

    if (!track || !previousButton || !nextButton) {
        return;
    }

    const updateButtons = () => {
        const maxScroll = track.scrollWidth - track.clientWidth;
        previousButton.disabled = track.scrollLeft <= 4;
        nextButton.disabled = maxScroll - track.scrollLeft <= 4;
    };

    const moveTrack = (direction) => {
        const card = track.querySelector('.skill-card');
        const cardWidth = card ? card.getBoundingClientRect().width : track.clientWidth;
        const gap = parseFloat(getComputedStyle(track).gap) || 0;
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth';

        track.scrollBy({ left: direction * (cardWidth + gap), behavior });
    };

    previousButton.addEventListener('click', () => moveTrack(-1));
    nextButton.addEventListener('click', () => moveTrack(1));
    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    updateButtons();
});

//darkmode
const themeToggle = document.querySelector('.theme-toggle');
if (themeToggle) {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        document.documentElement.classList.add('light-mode');
    }

    updateThemeButton();

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');

        const isLightMode = document.body.classList.contains('light-mode');
        document.documentElement.classList.toggle('light-mode', isLightMode);
        localStorage.setItem('theme', isLightMode ? 'light' : 'dark');

        updateThemeButton();
        updateVantaColors();
    });
}

function updateThemeButton() {
    const isLightMode = document.body.classList.contains('light-mode');
    const icon = themeToggle.querySelector('i');

    themeToggle.setAttribute(
        'aria-label',
        isLightMode ? 'Switch to dark mode' : 'Switch to light mode'
    );

    icon.className = isLightMode
        ? 'fa-solid fa-lightbulb'
        : 'fa-regular fa-lightbulb';
}

function getVantaColors() {
    const isLightMode = document.body.classList.contains('light-mode');

    return {
        color: isLightMode ? 0x007e8a : 0x19f4ff,
        backgroundColor: isLightMode ? 0xe8f5f4 : 0x03070c
    };
}

function updateVantaColors() {
    if (vantaNet) {
        vantaNet.setOptions(getVantaColors());
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function initializeVantaNet() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    const vantaLayer = document.createElement('div');
    vantaLayer.id = 'vanta-net';
    vantaLayer.setAttribute('aria-hidden', 'true');
    document.body.prepend(vantaLayer);

    try {
        if (!window.THREE) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js');
        }

        if (!window.VANTA || !window.VANTA.NET) {
            await loadScript('https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.net.min.js');
        }

        vantaNet = window.VANTA.NET({
            el: '#vanta-net',
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200,
            minWidth: 200,
            scale: 1,
            scaleMobile: 1,
            backgroundAlpha: 0,
            points: 9,
            maxDistance: 20,
            spacing: 22,
            showDots: true,
            ...getVantaColors()
        });

        document.body.classList.add('vanta-ready');
    } catch {
        vantaLayer.remove();
    }
}

initializeVantaNet();

// Experience carousel
const carousel = document.querySelector('.carousel');
if (carousel) {
    const track = carousel.querySelector('.carousel-track');
    const slides = [...track.children];
    const dotsBox = carousel.querySelector('.carousel-dots');
    const prev = carousel.querySelector('.prev');
    const next = carousel.querySelector('.next');
    const dots = slides.map((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', 'Go to job ' + (i + 1));
        dot.addEventListener('click', () => goTo(i));
        dotsBox.appendChild(dot);
        return dot;
    });
    let index = 0;

    function goTo(i) {
        index = Math.max(0, Math.min(slides.length - 1, i));
        track.scrollTo({ left: slides[index].offsetLeft - track.offsetLeft, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
    }

    function sync() {
        index = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
        prev.disabled = index === 0;
        next.disabled = index === slides.length - 1;
    }

    prev.addEventListener('click', () => goTo(index - 1));
    next.addEventListener('click', () => goTo(index + 1));
    track.addEventListener('scroll', sync, { passive: true });
    track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') goTo(index - 1);
        if (e.key === 'ArrowRight') goTo(index + 1);
    });
    sync();
}

// Portfolio Q&A
const chatLauncher = document.createElement('button');
chatLauncher.className = 'portfolio-chat-launcher';
chatLauncher.type = 'button';
chatLauncher.setAttribute('aria-label', 'I'm here to help!');
chatLauncher.innerHTML = '<i class="fa-regular fa-comments" aria-hidden="true"></i><span>I'm here to help!</span>';

const chatDialog = document.createElement('dialog');
chatDialog.className = 'portfolio-chat';
chatDialog.setAttribute('aria-labelledby', 'portfolio-chat-title');
chatDialog.innerHTML = `
    <header class="portfolio-chat-header">
        <div>
            <p class="portfolio-chat-kicker">BRANDON'S PORTFOLIO</p>
            <h2 id="portfolio-chat-title">Ask my notebook</h2>
        </div>
        <button class="portfolio-chat-close" type="button" aria-label="Close chat">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
    </header>
    <p class="portfolio-chat-note">Answers are based on the information published on this site.</p>
    <div class="portfolio-chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
    <div class="portfolio-chat-prompts" aria-label="Suggested questions">
        <button type="button">What experience do I have?</button>
        <button type="button">What are my technical skills?</button>
        <button type="button">What am I studying?</button>
        <button type="button">What IT skills am I learning?</button>
        <button type="button">Have I led a team?</button>
        <button type="button">What is my career goal?</button>
    </div>
    <form class="portfolio-chat-form">
        <label class="visually-hidden" for="portfolio-chat-input">Your question</label>
        <input id="portfolio-chat-input" name="message" maxlength="1000" autocomplete="off" placeholder="Ask a question..." required>
        <button type="submit" aria-label="Send question">
            <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
        </button>
    </form>
    <p class="portfolio-chat-status" aria-live="polite"></p>
`;

document.body.append(chatLauncher, chatDialog);

const chatMessages = chatDialog.querySelector('.portfolio-chat-messages');
const chatForm = chatDialog.querySelector('.portfolio-chat-form');
const chatInput = chatDialog.querySelector('#portfolio-chat-input');
const chatStatus = chatDialog.querySelector('.portfolio-chat-status');
const chatHistory = [];
const quickAnswers = new Map([
    ['what experience do i have', 'I have 8 years of hospitality experience, working at Columbus Coffee, Four Points by Sheraton Auckland, Novotel Tainui Hamilton, and Ibis Tainui Hamilton. My roles covered cafe and food-and-beverage service. [Experience]'],
    ['what are my technical skills', 'My listed hospitality and operations skills include Micros Simphony POS, cash handling, stock ordering through online portals such as PurchasePlus, Microsoft Excel for stocktakes and invoices, barista training, and beverage service. [Skills]'],
    ['what am i studying', 'I am studying toward a Level 5 Certificate in Information Technology at Waikato Institute of Technology. My four modules cover IT operations, Python programming, interactive digital media, and information systems. [Education]'],
    ['what it skills am i learning', 'I am learning PC hardware and software, operating systems, networking, IT security and troubleshooting, Python, HTML and CSS, user experience and interface design, and information systems. [Education]'],
    ['have i led a team', 'Yes. My Skills page says I led 3-4 staff per shift and delegated tasks during service. [Skills]'],
    ['what is my career goal', 'I hope to work in web design and create high-quality websites for businesses and personal use that are easy for clients to use. [About]']
]);

function addChatMessage(text, role) {
    const message = document.createElement('div');
    message.className = `portfolio-chat-message ${role}`;
    message.textContent = text;
    chatMessages.append(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

addChatMessage('Hi, I can answer questions about my background, skills, experience, and studies.', 'assistant');

chatLauncher.addEventListener('click', () => {
    chatDialog.showModal();
    chatInput.focus();
});

chatDialog.querySelector('.portfolio-chat-close').addEventListener('click', () => chatDialog.close());
chatDialog.addEventListener('click', (event) => {
    if (event.target === chatDialog) {
        chatDialog.close();
    }
});

chatDialog.querySelectorAll('.portfolio-chat-prompts button').forEach((prompt) => {
    prompt.addEventListener('click', () => {
        chatInput.value = prompt.textContent;
        chatForm.requestSubmit();
    });
});

chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();

    if (!message) {
        return;
    }

    chatHistory.push({ role: 'user', text: message });
    addChatMessage(message, 'user');
    chatInput.value = '';

    const quickAnswer = quickAnswers.get(message.toLowerCase().replace(/[?.!]/g, '').trim());
    if (quickAnswer) {
        addChatMessage(quickAnswer, 'assistant');
        chatHistory.push({ role: 'model', text: quickAnswer });
        chatStatus.textContent = '';
        return;
    }

    chatStatus.textContent = 'Thinking...';
    chatForm.querySelector('button[type="submit"]').disabled = true;

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'portfolio-chat-message assistant portfolio-chat-typing';
    typingIndicator.setAttribute('aria-hidden', 'true');
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.append(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, history: chatHistory.slice(-8) })
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'The chat service is unavailable.');
        }

        addChatMessage(result.answer, 'assistant');
        chatHistory.push({ role: 'model', text: result.answer });
        chatStatus.textContent = '';
    } catch (error) {
        const errorMessage = error instanceof Error && error.message !== 'Failed to fetch'
            ? error.message
            : 'I could not reach the chat service. Please try again later.';
        addChatMessage(errorMessage, 'assistant');
        chatStatus.textContent = errorMessage;
    } finally {
        typingIndicator.remove();
        chatForm.querySelector('button[type="submit"]').disabled = false;
        chatInput.focus();
    }
});
