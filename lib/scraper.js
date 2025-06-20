import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class InstagramDMScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.lastMessageCount = 0;
    this.lastFirstDmContent = '';
    this.retryCount = 0;
    this.maxRetries = 5;
    this.scanInterval = 5000; // 5 seconds between scans
    this.conversationScrollCount = 15; // Number of messages to scroll through
    this.isInitialized = false; // Prevent multiple initializations
  }

  /**
   * Initialize Puppeteer browser and page with session handling
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('✅ Already initialized, skipping...');
      return;
    }

    try {
      console.log('🚀 Initializing Puppeteer browser...');
      
      this.browser = await puppeteer.launch({
        headless: false, // Set to true in production
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        defaultViewport: { width: 1280, height: 720 }
      });

      this.page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Disable console logging from page to reduce noise
      this.page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('error') || text.includes('Error')) {
          if (!text.includes('Permissions-Policy header') && !text.includes('Origin trial controlled feature')) {
            console.log('📄 Page Error:', text);
          }
        }
      });
      
      // Listen to page errors
      this.page.on('pageerror', (error) => {
        console.error('❌ Page Error:', error.message);
      });
      
      // Inject session cookies
      await this.injectSessionCookies();
      
      this.isInitialized = true;
      console.log('✅ Puppeteer initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Puppeteer:', error);
      throw error;
    }
  }

  /**
   * Inject Instagram session cookies for authentication
   */
  async injectSessionCookies() {
    try {
      console.log('🍪 Injecting session cookies...');
      
      const sessionId = process.env.SESSIONID;
      if (!sessionId) {
        throw new Error('SESSIONID environment variable is not set');
      }

      // Set the session cookie for Instagram
      await this.page.setCookie({
        name: 'sessionid',
        value: sessionId,
        domain: '.instagram.com',
        path: '/',
        secure: true,
        httpOnly: true
      });

      console.log('✅ Session cookies injected successfully');
    } catch (error) {
      console.error('❌ Failed to inject session cookies:', error);
      throw error;
    }
  }

  /**
   * Start the DM scanning process
   */
  async startScraping() {
    if (this.isRunning) {
      console.log('⚠️ Scraper is already running');
      return;
    }

    try {
      console.log('🚀 Starting Instagram DM scraper...');
      await this.initialize();
      this.isRunning = true;

      // Navigate to Instagram DMs
      await this.navigateToDMs();
      
      // Start continuous monitoring
      await this.monitorDMs();
    } catch (error) {
      console.error('❌ Error starting scraper:', error);
      this.isRunning = false;
      
      // Auto-retry logic
      this.retryCount++;
      if (this.retryCount < this.maxRetries) {
        console.log(`🔄 Retrying in 30 seconds... (Attempt ${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => this.startScraping(), 30000);
      } else {
        console.error('❌ Max retries reached. Scraper failed to start.');
      }
    }
  }

  /**
   * Navigate to Instagram Direct Messages
   */
  async navigateToDMs() {
    try {
      console.log('🧭 Navigating to Instagram DMs...');
      
      const targetUrl = process.env.TARGET_URL || 'https://www.instagram.com/direct/inbox/';
      
      await this.page.goto(targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.page.waitForSelector('body', { timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      const currentUrl = await this.page.url();
      
      if (!currentUrl.includes('instagram.com/direct')) {
        throw new Error('Failed to navigate to Instagram DMs');
      }

      console.log('✅ Successfully navigated to Instagram DMs');
    } catch (error) {
      console.error('❌ Error navigating to DMs:', error);
      throw error;
    }
  }

  /**
   * Main monitoring loop for detecting new DMs
   */
  async monitorDMs() {
    console.log('🔄 Starting DM monitoring loop...');
    
    while (this.isRunning) {
      try {
        if (!this.page || this.page.isClosed()) {
          console.log('❌ Page is closed, stopping scraper');
          break;
        }

        const newDm = await this.detectNewDM();
        
        if (newDm) {
          console.log(`🎉 New DM detected from: ${newDm.username}`);
          this.lastFirstDmContent = newDm.content;
          await this.scanConversation(newDm);
          await this.returnToInbox();
        }

        await new Promise(resolve => setTimeout(resolve, this.scanInterval));
      } catch (error) {
        console.error('❌ Error in monitoring loop:', error);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  /**
   * Detect if there's a new DM in the inbox
   */
  async detectNewDM() {
    try {
      const dmInfo = await this.page.evaluate(() => {
        const dmContainers = document.querySelectorAll('div[class*="x13dflua"][style*="opacity: 1"]');
        
        if (dmContainers.length === 0) {
          return null;
        }

        const firstContainer = dmContainers[0];
        const button = firstContainer.querySelector('div[role="button"]');
        
        if (!button) {
          return null;
        }

        let username = 'Unknown';
        let message = '';
        let time = '';
        
        // Extract username
        const usernameSelectors = [
          'span[class*="xlyipyv"]',
          'span[class*="x1lliihq"]',
          'span[class*="x1heor9g"]',
          'span[dir="auto"]',
          'h6 span',
          'div[role="button"] span'
        ];
        
        for (const selector of usernameSelectors) {
          const element = button.querySelector(selector);
          if (element && element.textContent.trim()) {
            username = element.textContent.trim();
            break;
          }
        }
        
        // Extract message
        const messageSelectors = [
          'span[class*="x1fhwpqd"]',
          'span[class*="x1lliihq"]',
          'span[class*="x1heor9g"]',
          'div[class*="x1n2onr6"] span',
          'span[dir="auto"]'
        ];
        
        for (const selector of messageSelectors) {
          const element = button.querySelector(selector);
          if (element && element.textContent.trim() && element.textContent.trim() !== username) {
            message = element.textContent.trim();
            break;
          }
        }
        
        // Get time
        const timeElement = button.querySelector('abbr[aria-label]');
        if (timeElement) {
          time = timeElement.getAttribute('aria-label');
        }
        
        const content = `${username}: ${message} (${time})`;
        
        return {
          username,
          message,
          time,
          content,
          container: true
        };
      });

      if (!dmInfo) {
        return null;
      }

      // Check if this is a new DM
      if (dmInfo.content !== this.lastFirstDmContent && this.lastFirstDmContent !== '') {
        console.log('🎉 DM CONTENT CHANGED!');
        return dmInfo;
      } else if (this.lastFirstDmContent === '') {
        console.log('🆕 First time checking - setting initial DM:', dmInfo.username);
        return dmInfo;
      }

      return null;
    } catch (error) {
      console.error('❌ Error detecting new DM:', error);
      return null;
    }
  }

  /**
   * Open a DM conversation and scan for ad reply messages
   */
  async scanConversation(dmInfo) {
    try {
      console.log(`🔍 Opening conversation with ${dmInfo.username}...`);
      
      const clicked = await this.page.evaluate(() => {
        const dmContainers = document.querySelectorAll('div[class*="x13dflua"][style*="opacity: 1"]');
        if (dmContainers.length > 0) {
          const button = dmContainers[0].querySelector('div[role="button"]');
          if (button) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        console.log('❌ Failed to click on DM');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const isInConversation = await this.page.evaluate(() => {
        return window.location.href.includes('/direct/t/');
      });

      if (!isInConversation) {
        console.log('❌ Failed to load conversation');
        return;
      }

      console.log('✅ Conversation loaded successfully');
      
      // Scan for ad reply messages with enhanced extraction
      await this.scanForAdReplies();
      
    } catch (error) {
      console.error('❌ Error scanning conversation:', error);
    }
  }

  /**
   * Enhanced scan for ad reply messages with handle and prior message extraction
   */
  async scanForAdReplies() {
    try {
      console.log('🔍 Scanning conversation for ad reply messages...');
      
      // Scroll through messages to load more content
      await this.scrollThroughMessages();
      
      // Extract ad reply messages with enhanced data
      const adReplies = await this.extractEnhancedAdReplyMessages();
      
      if (adReplies.length > 0) {
        console.log(`🎯 Found ${adReplies.length} ad reply message(s)`);
        await this.processAdReplies(adReplies);
      } else {
        console.log('📭 No ad reply messages found in this conversation');
      }
      
    } catch (error) {
      console.error('❌ Error scanning for ad replies:', error);
    }
  }

  /**
   * Scroll through messages to load more content
   */
  async scrollThroughMessages() {
    for (let i = 0; i < this.conversationScrollCount; i++) {
      await this.page.evaluate(() => {
        const messageContainer = document.querySelector('div[role="main"]') || 
                                document.querySelector('div[data-pagelet="IGDThreadList"]');
        if (messageContainer) {
          messageContainer.scrollTop = messageContainer.scrollTop - 100;
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  /**
   * Enhanced extraction of ad reply messages with handle and prior message
   */
  async extractEnhancedAdReplyMessages() {
    try {
      const adReplies = await this.page.evaluate(() => {
        // --- 1. Get display name and handle from the specified class structure ---
        function getHeaderInfo() {
          let displayName = null, handle = null;
          // Instagram DM header area
          const headerDiv = document.querySelector('div.x9f619.x1n2onr6.x1ja2u2z.x78zum5.xdt5ytf.x193iq5w.xeuugli.x1r8uery.x1iyjqo2.xs83m0k');
          if (headerDiv) {
            const nameEl = headerDiv.querySelector('h2 span');
            if (nameEl && nameEl.textContent) displayName = nameEl.textContent.trim();
            // Try to extract handle from profile link
            const profileLink = headerDiv.querySelector('a[href^="/"]');
            if (profileLink && profileLink.getAttribute('href')) {
              const href = profileLink.getAttribute('href');
              // href is like '/induharidas'
              handle = href.replace(/^\//, '').replace(/\/$/, '');
            }
          }
          return { displayName, handle };
        }

        // --- 2. Find all message containers ---
        const messageContainers = Array.from(document.querySelectorAll('div[role="row"], div[class*="x1n2onr6"]'));
        const messages = messageContainers.map((el, idx) => ({
          el,
          text: el.textContent || '',
          idx
        }));

        // --- 3. Find all "replied to an ad" messages ---
        const adReplyIndices = messages
          .map((msg, idx) => msg.text.includes('replied to an ad') ? idx : -1)
          .filter(idx => idx !== -1);

        // --- 4. For each ad reply, extract info ---
        const { displayName, handle } = getHeaderInfo();
        const userMap = {};

        for (const adIdx of adReplyIndices) {
          // The 'content' is the actual ad reply line
          const adReplyContent = messages[adIdx].text.trim();

          // The message above is the user's message (priorMessage)
          let priorMessage = null;
          for (let i = adIdx - 1; i >= Math.max(0, adIdx - 5); i--) {
            const msgText = messages[i].text.trim();
            if (
              msgText &&
              msgText.length > 1 &&
              !msgText.includes('replied to an ad') &&
              !msgText.includes('View ad') &&
              !msgText.match(/^[0-9]{1,2}:[0-9]{2}/) &&
              !msgText.includes('Active') &&
              !msgText.includes('ago') &&
              !msgText.includes('Today at')
            ) {
              priorMessage = msgText;
              break;
            }
          }

          // Find ad link in this or nearby messages
          let adLink = null;
          const linkSelectors = [
            'a[href*="instagram.com/p/"]',
            'a[href*="/p/"]',
            'a[target="_blank"]',
            'a[aria-label*="View"]'
          ];
          // Check current message
          for (const sel of linkSelectors) {
            const link = messages[adIdx].el.querySelector(sel);
            if (link && link.href && (link.href.includes('instagram.com/p/') || link.href.includes('/p/'))) {
              adLink = link.href;
              break;
            }
          }
          // Fallback: check nearby messages
          if (!adLink) {
            for (let i = Math.max(0, adIdx - 2); i <= Math.min(messages.length - 1, adIdx + 2); i++) {
              for (const sel of linkSelectors) {
                const link = messages[i].el.querySelector(sel);
                if (link && link.href && (link.href.includes('instagram.com/p/') || link.href.includes('/p/'))) {
                  adLink = link.href;
                  break;
                }
              }
              if (adLink) break;
            }
          }

          // Deduplicate by displayName + handle
          const key = (displayName || '') + '|' + (handle || '');
          if (!userMap[key]) {
            userMap[key] = {
              senderUsername: displayName || '',
              senderHandle: handle || '',
              content: adReplyContent || '',
              priorMessage: priorMessage || '',
              adLink: adLink || null
            };
          } else {
            // If a new adLink is found (not null), update it
            if (adLink) {
              userMap[key].adLink = adLink;
            }
            // If a new priorMessage is found, update it
            if (priorMessage) {
              userMap[key].priorMessage = priorMessage;
            }
            // If a new adReplyContent is found, update it
            if (adReplyContent) {
              userMap[key].content = adReplyContent;
            }
          }
        }
        // Only keep entries where senderUsername and priorMessage are present
        return Object.values(userMap).filter(e => e.senderUsername && e.priorMessage);
      });

      return adReplies;
    } catch (error) {
      return [];
    }
  }

  /**
   * Process and save enhanced ad reply messages
   */
  async processAdReplies(adReplies) {
    for (const message of adReplies) {
      try {
        // Only process if both senderUsername and priorMessage are present
        if (typeof message.senderUsername === 'string' && message.priorMessage) {
          const dbMessage = {
            senderUsername: message.senderUsername, // display name
            senderHandle: message.senderHandle, // Instagram handle
            recipientUsername: 'Current User', // or set dynamically if needed
            content: message.content, // the ad reply line
            priorMessage: message.priorMessage, // the message above
            adData: {
              adLink: message.adLink || null
            }
          };
          await this.saveMessage(dbMessage);
        }
      } catch (error) {
        // Only log errors
      }
    }
  }

  /**
   * Save message to database via API
   */
  async saveMessage(messageData) {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
      });
      if (!response.ok) {
        throw new Error(`Failed to save message: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      // Only log errors
    }
  }

  /**
   * Return to the inbox from conversation
   */
  async returnToInbox() {
    try {
      const returned = await this.page.evaluate(() => {
        const backSelectors = [
          'a[href*="/direct/"]',
          'button[aria-label*="Back"]',
          'button[aria-label*="Close"]'
        ];
        
        for (const selector of backSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            element.click();
            return true;
          }
        }
        
        if (window.location.href.includes('/direct/t/')) {
          window.location.href = '/direct/inbox/';
          return true;
        }
        
        return false;
      });
      
      if (returned) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        const targetUrl = process.env.TARGET_URL || 'https://www.instagram.com/direct/inbox/';
        await this.page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
      }
    } catch (error) {
      console.error('❌ Error returning to inbox:', error);
    }
  }

  /**
   * Stop the scraper
   */
  async stop() {
    console.log('🛑 Stopping Instagram DM scraper...');
    this.isRunning = false;
    
    if (this.browser) {
      await this.browser.close();
      console.log('✅ Browser closed');
    }
    
    this.isInitialized = false;
    console.log('🛑 Scraper stopped successfully');
  }

  /**
   * Get current scraper status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      retryCount: this.retryCount,
      lastFirstDmContent: this.lastFirstDmContent,
      scanInterval: this.scanInterval
    };
  }
}

// Create a singleton instance
const scraper = new InstagramDMScraper();

// Export the scraper instance and a start function
export { scraper as default };

// Export a function to start the scraper
export async function startScraper() {
  console.log('🚀 Starting enhanced Instagram DM scraper...');
  
  if (!process.env.SESSIONID) {
    console.error('❌ Missing required environment variable: SESSIONID');
    console.log('Please set SESSIONID in your .env file');
    return;
  }
  
  try {
    await scraper.startScraping();
  } catch (error) {
    console.error('❌ Failed to start scraper:', error);
  }
}

// Handle server shutdown gracefully
process.on('SIGINT', async () => {
  console.log('🛑 Server shutting down, stopping scraper...');
  await scraper.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Server terminating, stopping scraper...');
  await scraper.stop();
  process.exit(0);
});