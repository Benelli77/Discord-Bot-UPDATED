const {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus
} = require('@discordjs/voice');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const play = require('play-dl');

class MusicPlayer {
    constructor() {
        this.queues = new Map();
        this.players = new Map();
        this.nowPlayingMessages = new Map(); // Para rastrear mensagens do player
    }

    createMusicEmbed(song) {
        return new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🎵 Tocando Agora')
            .setDescription(`**${song.title}**`)
            .setURL(song.url)
            .setTimestamp();
    }

    createControlButtons(isPaused = false) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('⏮️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(isPaused ? 'resume' : 'pause')
                    .setLabel(isPaused ? '▶️' : '⏸️')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('skip')
                    .setLabel('⏭️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('stop')
                    .setLabel('⏹️')
                    .setStyle(ButtonStyle.Danger)
            );
    }

    async updatePlayer(guildId, interaction = null) {
        const queue = this.queues.get(guildId);
        const currentSong = queue?.[0];

        if (!currentSong) return;

        const playerObj = this.players.get(guildId);
        const isPaused = playerObj?.player.state.status === AudioPlayerStatus.Paused;

        const embed = this.createMusicEmbed(currentSong);
        const buttons = this.createControlButtons(isPaused);

        const messageContent = {
            embeds: [embed],
            components: [buttons]
        };

        // Atualiza ou envia nova mensagem do player
        const nowPlayingMessage = this.nowPlayingMessages.get(guildId);
        if (nowPlayingMessage) {
            try {
                await nowPlayingMessage.edit(messageContent);
            } catch (error) {
                console.error('Erro ao atualizar player:', error);
            }
        } else if (interaction) {
            const message = await interaction.channel.send(messageContent);
            this.nowPlayingMessages.set(guildId, message);
        }
    }

    async play(interaction, query) {
        try {
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return await interaction.reply({
                    content: '❌ Você precisa estar em um canal de voz!',
                    ephemeral: true
                });
            }

            const permissions = voiceChannel.permissionsFor(interaction.client.user);
            if (!permissions.has('Connect') || !permissions.has('Speak')) {
                return await interaction.reply('❌ Preciso de permissões para entrar e falar no canal de voz!');
            }

            await interaction.deferReply();

            try {
                // Criar conexão
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: false
                });

                // Criar player
                const player = createAudioPlayer({
                    behaviors: {
                        noSubscriber: NoSubscriberBehavior.Play,
                        maxMissedFrames: 50
                    }
                });

                // Subscrever o player à conexão
                const subscription = connection.subscribe(player);
                if (!subscription) {
                    return await interaction.editReply('❌ Falha ao conectar ao canal de voz!');
                }

                // Processar a URL/busca
                let songInfo;
                if (play.yt_validate(query)) {
                    songInfo = await play.video_info(query);
                } else {
                    const searchResults = await play.search(query, {
                        limit: 1,
                        source: {
                            youtube: 'video'
                        }
                    });
                    if (!searchResults || searchResults.length === 0) {
                        return await interaction.editReply('❌ Não encontrei nenhuma música!');
                    }
                    songInfo = await play.video_info(searchResults[0].url);
                }

                const song = {
                    title: songInfo.video_details.title,
                    url: songInfo.video_details.url,
                    duration: songInfo.video_details.durationInSec
                };

                // Inicializar fila
                if (!this.queues.has(interaction.guildId)) {
                    this.queues.set(interaction.guildId, []);
                }
                const queue = this.queues.get(interaction.guildId);

                // Adicionar à fila
                queue.push(song);

                // Configurar o player
                this.players.set(interaction.guildId, { player, connection });

                // Se for a primeira música, começar a tocar
                if (queue.length === 1) {
                    await this.playNext(interaction.guildId);
                }

                await interaction.editReply(`✅ Adicionado à fila: ${song.title}`);

            } catch (error) {
                console.error('Erro ao processar música:', error);
                await interaction.editReply(`❌ Erro: ${error.message}`);
            }

        } catch (error) {
            console.error('Erro geral:', error);
            if (interaction.deferred) {
                await interaction.editReply(`❌ Erro: ${error.message}`);
            }
        }
    }

    async playNext(guildId) {
        const queue = this.queues.get(guildId);
        const playerObj = this.players.get(guildId);

        if (!queue || queue.length === 0 || !playerObj) {
            console.log('Queue or player not found:', {
                hasQueue: !!queue,
                queueLength: queue?.length,
                hasPlayer: !!playerObj
            });
            return;
        }

        try {
            const song = queue[0];
            console.log('Iniciando reprodução:', song.title);

            // Verificar se a URL é válida
            if (!play.yt_validate(song.url)) {
                throw new Error('URL do vídeo inválida');
            }

            // Usar play-dl para streaming
            console.log('Obtendo stream para:', song.url);
            const stream = await play.stream(song.url, {
                discordPlayerCompatibility: true,
                quality: 2,
                seek: 0,
                htmldata: true
            }).catch(error => {
                console.error('Erro ao obter stream:', error);
                throw error;
            });

            if (!stream || !stream.stream) {
                throw new Error('Stream não foi obtido corretamente');
            }

            console.log('Stream obtido, tipo:', stream.type);

            // Criar recurso de áudio
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: true
            });

            // Configurar volume
            if (resource.volume) {
                resource.volume.setVolume(1);
            }

            // Adicionar listeners para debug
            playerObj.player.on(AudioPlayerStatus.Playing, () => {
                console.log(`Tocando agora: ${song.title}`);
            });

            playerObj.player.on(AudioPlayerStatus.Buffering, () => {
                console.log('Buffering...');
            });

            playerObj.player.on(AudioPlayerStatus.Idle, () => {
                console.log('Player ficou idle');
                queue.shift();
                if (queue.length > 0) {
                    this.playNext(guildId);
                }
            });

            playerObj.player.on('error', error => {
                console.error('Erro no player:', error);
            });

            // Verificar se a conexão ainda está ativa
            if (playerObj.connection.state.status === VoiceConnectionStatus.Disconnected) {
                console.log('Conexão está desconectada, tentando reconectar...');
                playerObj.connection.rejoin();
            }

            // Tocar o áudio
            console.log('Iniciando reprodução do recurso de áudio');
            playerObj.player.play(resource);
            console.log('Comando de play enviado');

        } catch (error) {
            console.error('Erro ao tocar música:', error);
            console.error('Stack trace:', error.stack);
            queue.shift();
            if (queue.length > 0) {
                this.playNext(guildId);
            }
        }
    }

    stop(interaction) {
        const playerObj = this.players.get(interaction.guildId);
        if (!playerObj) {
            return interaction.reply('Não há nada tocando!');
        }

        this.queues.set(interaction.guildId, []);
        playerObj.player.stop();
        playerObj.connection.destroy();
        this.players.delete(interaction.guildId);
        return interaction.reply('⏹️ Música parada e fila limpa!');
    }

    skip(interaction) {
        const playerObj = this.players.get(interaction.guildId);
        if (!playerObj) {
            return interaction.reply('Não há nada tocando!');
        }

        playerObj.player.stop(); // Isso vai disparar o evento Idle que tocará a próxima música
        return interaction.reply('⏭️ Pulando para a próxima música!');
    }

    async queue(interaction) {
        try {
            const queue = this.queues.get(interaction.guildId);
            if (!queue || queue.length === 0) {
                return await interaction.reply('🎵 A fila está vazia!');
            }

            const queueEmbed = {
                color: 0x0099FF,
                title: '📜 Fila de Músicas',
                description: queue.map((song, index) =>
                    `${index + 1}. ${song.title}`
                ).join('\n'),
                footer: {
                    text: `Total de músicas: ${queue.length}`
                }
            };

            await interaction.reply({ embeds: [queueEmbed] });
        } catch (error) {
            console.error('Erro ao mostrar fila:', error);
            await interaction.reply('❌ Erro ao mostrar a fila de músicas!');
        }
    }

    async clearQueue(interaction) {
        try {
            const queue = this.queues.get(interaction.guildId);
            if (!queue || queue.length === 0) {
                return await interaction.reply('🎵 A fila já está vazia!');
            }

            // Mantém apenas a música atual (primeira da fila)
            const currentSong = queue[0];
            this.queues.set(interaction.guildId, [currentSong]);

            await interaction.reply('🧹 Fila limpa! Apenas a música atual foi mantida.');
        } catch (error) {
            console.error('Erro ao limpar fila:', error);
            await interaction.reply('❌ Erro ao limpar a fila de músicas!');
        }
    }

    async handleButton(interaction) {
        const { customId } = interaction;
        const guildId = interaction.guildId;
        const playerObj = this.players.get(guildId);

        if (!playerObj) {
            return interaction.reply({ content: 'Não há música tocando!', ephemeral: true });
        }

        switch (customId) {
            case 'pause':
                playerObj.player.pause();
                await this.updatePlayer(guildId);
                break;
            case 'resume':
                playerObj.player.unpause();
                await this.updatePlayer(guildId);
                break;
            case 'skip':
                playerObj.player.stop();
                await interaction.reply({ content: '⏭️ Música pulada!', ephemeral: true });
                break;
            case 'stop':
                this.queues.set(guildId, []);
                playerObj.player.stop();
                playerObj.connection.destroy();
                this.players.delete(guildId);
                const nowPlayingMessage = this.nowPlayingMessages.get(guildId);
                if (nowPlayingMessage) {
                    nowPlayingMessage.delete().catch(console.error);
                    this.nowPlayingMessages.delete(guildId);
                }
                await interaction.reply({ content: '⏹️ Música parada!', ephemeral: true });
                break;
            case 'previous':
                await interaction.reply({ content: 'Função anterior ainda não implementada!', ephemeral: true });
                break;
        }

        // Confirma a interação se ainda não foi respondida
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        }
    }
}

module.exports = MusicPlayer; 