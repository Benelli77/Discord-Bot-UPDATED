require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra todos os comandos disponíveis'),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),

    new SlashCommandBuilder()
        .setName('oi')
        .setDescription('Cumprimentar o bot'),

    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Obtém informações do servidor ou do usuário')
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Informações sobre um usuário')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('O usuário')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('Informações sobre o servidor')),

    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Toca uma música')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Nome ou URL da música')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Para a música atual'),

    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Pula para próxima música'),

    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Mostra a fila de músicas atual'),

    new SlashCommandBuilder()
        .setName('clearq')
        .setDescription('Limpa a fila de músicas'),

    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pausa a música atual'),

    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Continua tocando a música'),

    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Sai do canal de voz'),

    new SlashCommandBuilder()
        .setName('disserte')
        .setDescription('Pede para a IA dissertar sobre um tema ou analisar uma imagem')
        .addStringOption(option =>
            option.setName('tema')
                .setDescription('O tema sobre o qual você quer que a IA disserte')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('imagem')
                .setDescription('Uma imagem para a IA analisar (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('estilo')
                .setDescription('Estilo de resposta desejado (ex: caipira, formal, informal, etc)')
                .setRequired(false))
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Começando a atualizar os comandos de aplicação (/).');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log('Comandos de aplicação (/) foram atualizados com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar os comandos:', error);
    }
})(); 