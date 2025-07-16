require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Discord client with minimal intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Middleware for JSON parsing and CORS
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Root endpoint for Render health check
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Discord Age Checker API is running' });
});

// Discord age checker endpoint
app.get('/api/discord-age/:userId', async (req, res) => {
  const { userId } = req.params;

  // Validate userId (must be numeric and valid Snowflake)
  if (!/^\d{17,19}$/.test(userId)) {
    return res.status(400).json({ error: 'Invalid user ID format' });
  }

  try {
    // Fetch user data from Discord API
    const user = await client.users.fetch(userId).catch(() => null);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate account age from Snowflake ID
    const creationTimestamp = Math.floor(user.createdTimestamp / 1000);
    const creationDate = new Date(user.createdTimestamp);
    const now = new Date();
    const ageInMs = now - creationDate;
    const years = Math.floor(ageInMs / (1000 * 60 * 60 * 24 * 365.25));
    const months = Math.floor((ageInMs % (1000 * 60 * 60 * 24 * 365.25)) / (1000 * 60 * 60 * 24 * 30));
    const days = Math.floor((ageInMs % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));

    const ageString = `${years > 0 ? `${years} year${years !== 1 ? 's' : ''}` : ''}${years > 0 && (months > 0 || days > 0) ? ', ' : ''}${months > 0 ? `${months} month${months !== 1 ? 's' : ''}` : ''}${months > 0 && days > 0 ? ', ' : ''}${days > 0 ? `${days} day${days !== 1 ? 's' : ''}` : ''}`.trim() || 'Less than a day';

    // Prepare response
    const response = {
      userId: user.id,
      username: user.tag,
      creationDate: creationDate.toISOString(),
      creationTimestamp: creationTimestamp,
      accountAge: ageString,
      avatar: user.avatarURL({ size: 128 }) || null,
      publicFlags: user.flags ? user.flags.toArray() : [],
      premiumType: user.premiumType || 0,
      locale: user.locale || 'Unknown'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({ error: 'Internal server error' });
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
