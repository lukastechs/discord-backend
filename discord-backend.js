const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

app.use(express.json());

client.once('ready', () => {
    console.log('Discord client logged in');
});

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
        const now = new Date();
        const diff = now - user.createdAt;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        const remainingDays = days % 30;
        const accountAge = `${years} years, ${months} months, ${remainingDays} days`;

        const response = {
            userId: user.id,
            username: user.username,
            creationDate,
            accountAge,
            age_days: days,
            avatar: user.avatarURL() || null,
            publicFlags: user.flags ? user.flags.toArray() : [],
            premiumType: user.premiumType || 0,
            verified: !user.bot,
            description: user.bio || null,
            locale: user.locale || 'Unknown'
        };

        console.log(`Successfully fetched user data for ID: ${userId}`);
        res.json(response);
    } catch (error) {
        console.error(`Error fetching user for ID ${userId}:`, error.message);
        res.status(500).json({ error: 'Could not fetch user data' });
    }
});

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
        const now = new Date();
        const diff = now - foundUser.createdAt;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        const remainingDays = days % 30;
        const accountAge = `${years} years, ${months} months, ${remainingDays} days`;

        const response = {
            userId: foundUser.id,
            username: foundUser.username,
            creationDate,
            accountAge,
            age_days: days,
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
