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

app.get('/api/discord-age-guild/:guildId', async (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
        console.error(`Invalid guild ID format: ${guildId}`);
        return res.status(400).json({ error: 'Invalid server ID format. Must be 17-19 digits.' });
    }

    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.error(`Guild not found for ID: ${guildId}`);
            return res.status(404).json({ error: 'Server not found' });
        }

        const creationDate = guild.createdAt.toISOString();
        const { accountAge, age_days } = calculateAccountAge(guild.createdAt);

        const response = {
            guildId: guild.id,
            name: guild.name,
            creationDate,
            accountAge,
            age_days,
            icon: guild.iconURL() || null,
            memberCount: guild.memberCount || null,
            description: guild.description || null,
            region: guild.region || 'Unknown'
        };

        console.log(`Successfully fetched guild data for ID: ${guildId}`);
        res.json(response);
    } catch (error) {
        console.error(`Error fetching guild for ID ${guildId}:`, error.message);
        if (error.code === 10004) { // Unknown Guild
            return res.status(404).json({ error: 'Server not found' });
        }
        if (error.code === 429) { // Rate limit
            return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
        }
        res.status(500).json({ error: 'Could not fetch server data' });
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
