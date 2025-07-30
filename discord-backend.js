const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Enable CORS for your cPanel frontend
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://socialagechecker.com'); // Replace with your cPanel domain
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`Discord client logged in as ${client.user.tag}`);
});

// Calculate creation date from Snowflake ID
function getCreationDate(snowflake) {
    const DISCORD_EPOCH = 1420070400000;
    const timestamp = (BigInt(snowflake) >> 22n) + BigInt(DISCORD_EPOCH);
    const date = new Date(Number(timestamp));
    return date;
}

// Calculate account age for users and guilds
function calculateAccountAge(creationDate) {
    const now = new Date();
    const created = new Date(creationDate);
    let years = now.getFullYear() - created.getFullYear();
    let months = now.getMonth() - created.getMonth();
    let days = now.getDate() - created.getDate();

    // Adjust for negative days
    if (days < 0) {
        months -= 1;
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += prevMonth.getDate();
    }

    // Adjust for negative months
    if (months < 0) {
        years -= 1;
        months += 12;
    }

    // Calculate total days for age_days
    const diff = now - created;
    const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    return {
        accountAge: `${years} years, ${months} months, ${days} days`,
        age_days: totalDays
    };
}

// Root endpoint for Render health checks
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Discord Age Checker Backend is running',
        botReady: client.isReady(),
        endpoints: [
            '/api/discord-age/:userId',
            '/api/discord-age-username/:username',
            '/api/discord-age-guild/:guildId',
            '/health'
        ]
    });
});

// User ID endpoint (unchanged)
app.get('/api/discord-age/:userId', async (req, res) => {
    const { userId } = req.params;

    if (!/^\d{17,19}$/.test(userId)) {
        console.error(`Invalid user ID format: ${userId}`);
        return res.status(400).json({ error: 'Invalid user ID format. Must be 17-19 digits.' });
    }

    try {
        const user = await client.users.fetch(userId);
        if (!user) {
            console.error(`User not found for ID: ${userId}`);
            return res.status(404).json({ error: 'User not found' });
        }

        const creationDate = user.createdAt.toISOString();
        const { accountAge, age_days } = calculateAccountAge(user.createdAt);

        const response = {
            userId: user.id,
            username: user.username,
            creationDate,
            accountAge,
            age_days,
            avatar: user.avatarURL() || null,
            publicFlags: user.flags ? user.flags.toArray() : [],
            premiumType: user.premiumType || 0,
            verified: !user.bot,
            description: user.bio || null,
            locale: user.locale || 'Undisclosed'
        };

        console.log(`Successfully fetched user data for ID: ${userId}`);
        res.json(response);
    } catch (error) {
        console.error(`Error fetching user for ID ${userId}:`, error.message);
        res.status(500).json({ error: 'Could not fetch user data' });
    }
});

// Username endpoint (unchanged)
app.get('/api/discord-age-username/:username', async (req, res) => {
    const { username } = req.params;

    if (!username || typeof username !== 'string') {
        console.error(`Invalid username format: ${username}`);
        return res.status(400).json({ error: 'Invalid username format' });
    }

    try {
        let foundUser = null;
        for (const guild of client.guilds.cache.values()) {
            const member = await guild.members.search({ query: username, limit: 1 });
            if (member.size > 0) {
                foundUser = member.first().user;
                break;
            }
        }

        if (!foundUser) {
            console.error(`User not found for username: ${username}`);
            return res.status(404).json({ error: 'User not found in any server the bot is in' });
        }

        const creationDate = foundUser.createdAt.toISOString();
        const { accountAge, age_days } = calculateAccountAge(foundUser.createdAt);

        const response = {
            userId: foundUser.id,
            username: foundUser.username,
            creationDate,
            accountAge,
            age_days,
            avatar: foundUser.avatarURL() || null,
            publicFlags: foundUser.flags ? foundUser.flags.toArray() : [],
            premiumType: foundUser.premiumType || 0,
            verified: !foundUser.bot,
            description: foundUser.bio || null,
            locale: foundUser.locale || 'Unknown'
        };

        console.log(`Successfully fetched user data for username: ${username}`);
        res.json(response);
    } catch (error) {
        console.error(`Error fetching user for username ${username}:`, error.message);
        res.status(500).json({ error: 'Could not fetch user data' });
    }
});

// Guild ID endpoint with /guilds/{guild.id}/preview
app.get('/api/discord-age-guild/:guildId', async (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
        console.error(`Invalid guild ID format: ${guildId}`);
        return res.status(400).json({ error: 'Invalid server ID format. Must be 17-19 digits.' });
    }

    const maxRetries = 3;
    let attempt = 0;

    // Calculate creation date from Snowflake as a fallback
    const creationDate = getCreationDate(guildId).toISOString();
    const { accountAge, age_days } = calculateAccountAge(creationDate);

    while (attempt < maxRetries) {
        try {
            const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/preview`, {
                headers: {
                    'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                    'User-Agent': 'SocialAgeChecker/1.0'
                }
            });

            if (!response.ok) {
                if (response.status === 404 || response.status === 403) {
                    console.error(`Guild not found or not discoverable for ID: ${guildId}`);
                    // Fallback to Snowflake-based response
                    return res.status(200).json({
                        guildId,
                        name: 'Unknown (Server not publicly discoverable)',
                        creationDate,
                        accountAge,
                        age_days,
                        icon: null,
                        approximate_member_count: null,
                        description: 'This server is not publicly discoverable. Invite the bot to get more details: https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot&permissions=0',
                        region: 'Unknown'
                    });
                }
                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers.get('Retry-After') || '1000', 10);
                    console.log(`Rate limit hit, retrying after ${retryAfter}ms`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    attempt++;
                    continue;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const guild = await response.json();
            const guildResponse = {
                guildId,
                name: guild.name || 'Unknown',
                creationDate,
                accountAge,
                age_days,
                icon: guild.icon ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png` : null,
                approximate_member_count: guild.approximate_member_count || null,
                description: guild.description || null,
                region: guild.region || 'Unknown'
            };

            console.log(`Successfully fetched guild preview for ID: ${guildId}`);
            return res.json(guildResponse);
        } catch (error) {
            console.error(`Attempt ${attempt + 1} - Error fetching guild preview for ID ${guildId}:`, error.message);
            attempt++;
            if (attempt === maxRetries) {
                // Fallback to Snowflake-based response
                return res.status(200).json({
                    guildId,
                    name: 'Unknown (Server not publicly discoverable)',
                    creationDate,
                    accountAge,
                    age_days,
                    icon: null,
                    approximate_member_count: null,
                    description: 'This server is not publicly discoverable. Invite the bot to get more details: https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot&permissions=0',
                    region: 'Unknown'
                });
            }
        }
    }

    console.error(`Failed to fetch guild for ID ${guildId} after ${maxRetries} attempts`);
    res.status(429).json({ error: 'Rate limit exceeded after multiple attempts. Please try again later.' });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', botReady: client.isReady() });
});

async function startServer() {
    try {
        await client.login(process.env.DISCORD_BOT_TOKEN);
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to login to Discord:', error.message);
        process.exit(1);
    }
}

startServer();
