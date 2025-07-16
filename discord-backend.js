require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Middleware for JSON parsing and CORS
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Calculate account age in human-readable format
function calculateAccountAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years > 0 ? `${years} years, ${months} months` : `${months} months`;
}

// Calculate age in days
function calculateAgeDays(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Root endpoint for Render health check
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Discord Age Checker API is running' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Discord age checker endpoint
app.get('/api/discord-age/:username', async (req, res) => {
  const { username } = req.params;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Try to find the user by searching guilds
    let user = null;
    for (const guild of client.guilds.cache.values()) {
      const members = await guild.members.search({ query: username, limit: 1 }).catch(() => null);
      if (members && members.size > 0) {
        user = members.first().user;
        break;
      }
    }

    if (!user) {
      // Fallback: Try fetching by ID if username is numeric
      if (/^\d{17,19}$/.test(username)) {
        user = await client.users.fetch(username).catch(() => null);
      }
      if (!user) {
        return res.status(404).json({ error: `User ${username} not found. Ensure the user is in a server the bot has access to or use a numeric user ID.` });
      }
    }

    // Calculate account age
    const creationDate = new Date(user.createdTimestamp);
    const accountAge = calculateAccountAge(creationDate);
    const ageDays = calculateAgeDays(creationDate);

    // Prepare response
    const response = {
      username: user.tag,
      user_id: user.id,
      estimated_creation_date: creationDate.toLocaleDateString(),
      account_age: accountAge,
      age_days: ageDays,
      avatar: user.avatarURL({ size: 128 }) || 'https://via.placeholder.com/50',
      verified: user.bot ? 'Bot' : (user.verified ? 'Yes' : 'No'),
      description: user.bio || 'N/A', // Note: Bio requires user profile access, may be null
      estimation_confidence: 'High',
      accuracy_range: 'Exact',
      public_flags: user.flags ? user.flags.toArray() : [],
      premium_type: user.premiumType || 0
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Discord API Error:', {
      status: error.status,
      data: error.data,
      message: error.message
    });
    res.status(500).json({
      error: 'Failed to fetch Discord data',
      details: error.message || 'No additional details'
    });
  }
});

// Start Discord client and Express server
client.login(process.env.DISCORD_BOT_TOKEN).then(() => {
  console.log('Discord client logged in');
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}).catch((error) => {
  console.error('Failed to login to Discord:', error.message);
  process.exit(1);
});
