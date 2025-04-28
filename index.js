require('dotenv').config();
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const MusicPlayer = require('./music.js');
const AIHandler = require('./ai.js');
const play = require('play-dl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

const cooldownsO = new Map();
const cooldownsBenelli = new Map();
const COOLDOWN_DURATION = 36000000;
const COOLDOWN_BENELLI = 30000;

// Inicializa o player de música
const musicPlayer = new MusicPlayer();

// Inicializa o handler de IA
const aiHandler = new AIHandler();

// Configuração inicial do play-dl
const youtubeCookie = process.env.YOUTUBE_COOKIE;

if (!youtubeCookie) {
    console.error('YouTube cookie não encontrado no arquivo .env');
    process.exit(1);
}

play.setToken({
    youtube: {
        cookie: youtubeCookie,
        api_key: process.env.YOUTUBE_API_KEY || ''
    },
    useragent: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
});

// Inicializar play-dl
(async () => {
    try {
        console.log('Initializing play-dl...');
        console.log('Using YouTube API Key:', process.env.YOUTUBE_API_KEY ? 'Yes' : 'No');
        console.log('Using YouTube Cookies:', youtubeCookie ? 'Yes' : 'No');

        const cookieInfo = await play.yt_validate(youtubeCookie);
        console.log('Cookie validation:', cookieInfo);

        await play.authorization();
        console.log('play-dl initialized successfully');
    } catch (error) {
        console.error('Error initializing play-dl:', error);
        if (error.message.includes('cookie')) {
            console.error('Please check your YouTube cookies in the .env file');
            console.error('Make sure you have all required cookies: SAPISID, APISID, SSID, HSID, SID, __Secure-1PSID, __Secure-3PSID');
        }
        process.exit(1);
    }
})();

client.once(Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Handler para comandos de aplicação (slash commands)
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton()) {
        await musicPlayer.handleButton(interaction);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'help') {
        const helpEmbed = {
            color: 0x0099FF,
            title: '📚 Lista de Comandos',
            fields: [
                {
                    name: '🛠️ Comandos Gerais',
                    value:
                        '`/help` - Mostra esta lista de comandos\n' +
                        '`/ping` - Testa a latência do bot\n' +
                        '`/oi` - Cumprimenta o bot\n' +
                        '`/info user` - Mostra informações de um usuário\n' +
                        '`/info server` - Mostra informações do servidor\n' +
                        '`/disserte` - Pede para a IA dissertar sobre um tema ou analisar uma imagem'
                },
                {
                    name: '🎵 Comandos de Música',
                    value:
                        '`/play` - Toca uma música (YouTube/Spotify/SoundCloud)\n' +
                        '`/stop` - Para a música atual\n' +
                        '`/skip` - Pula para próxima música\n' +
                        '`/queue` - Mostra a fila de músicas\n' +
                        '`/pause` - Pausa a música atual\n' +
                        '`/resume` - Continua a música\n' +
                        '`/leave` - Sai do canal de voz'
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Use / para ver todos os comandos'
            }
        };

        await interaction.reply({ embeds: [helpEmbed] });
        return;
    }

    if (commandName === 'ping') {
        await interaction.reply('Pong! 🏓');
    }
    else if (commandName === 'oi') {
        await interaction.reply(`Olá, ${interaction.user.username}! Como vai?`);
    }
    else if (commandName === 'info') {
        if (interaction.options.getSubcommand() === 'user') {
            const user = interaction.options.getUser('target');
            await interaction.reply(`Nome: ${user.username}\nID: ${user.id}\nAvatar: ${user.displayAvatarURL({ dynamic: true })}`);
        }
        else if (interaction.options.getSubcommand() === 'server') {
            await interaction.reply(`Nome do servidor: ${interaction.guild.name}\nTotal de membros: ${interaction.guild.memberCount}\nData de criação: ${interaction.guild.createdAt.toLocaleDateString()}`);
        }
    }

    // Comandos de música
    switch (commandName) {
        case 'play':
            const query = interaction.options.getString('query');
            await musicPlayer.play(interaction, query);
            break;
        case 'skip':
            await musicPlayer.skip(interaction);
            break;
        case 'queue':
            await musicPlayer.queue(interaction);
            break;
        case 'pause':
            await musicPlayer.pause(interaction);
            break;
        case 'resume':
            await musicPlayer.resume(interaction);
            break;
        case 'stop':
            await musicPlayer.stop(interaction);
            break;
        case 'leave':
            await musicPlayer.leave(interaction);
            break;
        case 'clearq':
            await musicPlayer.clearQueue(interaction);
            break;
    }

    if (commandName === 'disserte') {
        await interaction.deferReply();

        const topic = interaction.options.getString('tema');
        const image = interaction.options.getAttachment('imagem');
        const style = interaction.options.getString('estilo');

        try {
            let response;
            if (image) {
                const imageBuffer = await fetch(image.url).then(res => res.arrayBuffer());
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                response = await aiHandler.generateResponse(topic, true, base64Image, style);
            } else {
                response = await aiHandler.generateResponse(topic, false, null, style);
            }

            // Dividir a resposta em partes se for muito longa
            const maxLength = 2000;
            if (response.length > maxLength) {
                const partes = [];
                for (let i = 0; i < response.length; i += maxLength) {
                    partes.push(response.substring(i, i + maxLength));
                }

                await interaction.editReply(partes[0]);
                for (let i = 1; i < partes.length; i++) {
                    await interaction.followUp(partes[i]);
                }
            } else {
                await interaction.editReply(response);
            }
        } catch (error) {
            console.error('Erro ao processar comando /disserte:', error);
            await interaction.editReply('Desculpe, ocorreu um erro ao processar sua solicitação.');
        }
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;


    if (message.content.toLowerCase().includes('benelli gay')) {
        if (cooldownsBenelli.has(guildId)) return;

        await message.reply('O Benelli foi notificado, tu vai virar camiseta de saudade!');
        cooldownsBenelli.set(guildId, Date.now());

        setTimeout(() => {
            cooldownsBenelli.delete(guildId);
        }, COOLDOWN_BENELLI);
    }

    if (message.content.toLowerCase().includes('matt')) {
        if (cooldownsBenelli.has(guildId)) return;

        await message.reply('Vai tomar no cu!');
        cooldownsBenelli.set(guildId, Date.now());

        setTimeout(() => {
            cooldownsBenelli.delete(guildId);
        }, COOLDOWN_BENELLI);
    }
});

client.login(process.env.DISCORD_TOKEN);