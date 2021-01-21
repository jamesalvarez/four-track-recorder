const FourTrack = ((audioStream) => {

    // Settings
    const settings = Object.freeze({
        sampleRate: 44100,
        bufferSize: 2048,
    });

    // Get audio context
    const audioContext = window.AudioContext || window.webkitAudioContext;
    const context = new audioContext();

    // Setup nodes
    const volume = context.createGain();
    const audioInput = context.createMediaStreamSource(audioStream);
    const scriptProcessor = context.createScriptProcessor(settings.bufferSize, 2, 2);
    scriptProcessor.onaudioprocess = recordAudio;

    // Array to hold bufferSources for tracks
    const trackBufferSources = [null, null, null, null];

    // Array to hold audio buffers held in tracks
    const trackBuffers = [null, null, null, null];

    // Connect graph
    audioInput.connect(volume);
    volume.connect(scriptProcessor);
    scriptProcessor.connect(context.destination);

    // structure to hold recording related state
    const recState = {
        leftchannel: [],
        rightchannel: [],
        recording: false,
        recordingLength: 0,
        trackSetup: {
            tracks: []
        }
    };


    // public methods
    return {
        record,
        play,
        stop,
        previewTrack,
    }

    // stores incoming audio
    function recordAudio(e) {
        if (!recState.recording) return;
        const left = e.inputBuffer.getChannelData(0);
        const right = e.inputBuffer.getChannelData(1);
        recState.leftchannel.push(new Float32Array(left));
        recState.rightchannel.push(new Float32Array(right));
        recState.recordingLength += settings.bufferSize;
    }

    function record(trackSetup) {
        // Start non muted tracks
        trackSetup.tracks.forEach((track, index) => {

            const active = (track.mixed || !track.muted) && (trackBuffers[index] != null);

            if (active) {
                const trackAudioSource = context.createBufferSource();
                trackAudioSource.buffer = trackBuffers[index];

                if (!track.muted) {
                    trackAudioSource.connect(context.destination);
                }

                if (track.mixed) {
                    trackAudioSource.connect(volume);
                }

                trackAudioSource.start(0);
                console.log('started track ' + index);
                trackBufferSources[index] = trackAudioSource;
            }
        });


        // reset the buffers for the new recording
        recState.leftchannel.length = recState.rightchannel.length = 0;
        recState.recordingLength = 0;
        recState.trackSetup = trackSetup;

        // Flag recording to be true *see recordAudio
        recState.recording = true;
    }


    function play(trackSetup) {
        stopAndDisonnect();

        trackSetup.tracks.forEach((track, index) => {
            if (!track.muted) {
                startTrack(index, 0)
            }
        });
    }

    function startTrack(index, when) {
        const trackAudioSource = context.createBufferSource();
        trackAudioSource.buffer = trackBuffers[index];
        trackAudioSource.connect(context.destination);
        trackAudioSource.start(when);
        trackBufferSources[index] = trackAudioSource;
        console.log('started track ' + index);
    }

    function previewTrack(index) {
        stopAndDisonnect()
        startTrack(index)
    }

    function stop(wavBlobCallBack) {

        const wasRecording = recState.recording;
        stopAndDisonnect();

        if (!wasRecording) {
            return;
        }

        // we flat the left and right channels down
        const leftBuffer = mergeBuffers(recState.leftchannel, recState.recordingLength);
        const rightBuffer = mergeBuffers(recState.rightchannel, recState.recordingLength);
        const buffers = [leftBuffer, rightBuffer];

        const justRecordedBuffer = context.createBuffer(2, buffers[0].length, settings.sampleRate);

        for (let channel = 0; channel < 2; channel += 1) {
            justRecordedBuffer.getChannelData(channel).set(buffers[channel]);
        }

        // push recorded audio to track buffer
        trackBufferSources.forEach((trackAudioSource, index) => {
            if (recState.trackSetup.tracks[index].armed) {
                trackBuffers[index] = justRecordedBuffer;
            }
        });


        const blob = createWavBlob(leftBuffer, rightBuffer);
        wavBlobCallBack(blob);
    }

    function stopAndDisonnect() {
        // Flag recording to be false *see recordAudio
        recState.recording = false;

        // stop and disconnect tracks
        trackBufferSources.forEach((trackAudioSource, index) => {
            if (trackAudioSource) {
                console.log('stopped track ' + index);
                trackAudioSource.stop();
                trackAudioSource.disconnect();
            }
        });
    }

    function createWavBlob(leftBuffer, rightBuffer) {
        // we interleave both channels together
        const interleaved = interleave(leftBuffer, rightBuffer);

        // we create our wav file
        const buffer = new ArrayBuffer(44 + interleaved.length * 2);
        const view = new DataView(buffer);

        // RIFF chunk descriptor
        writeUTFBytes(view, 0, 'RIFF');
        view.setUint32(4, 44 + interleaved.length * 2, true);
        writeUTFBytes(view, 8, 'WAVE');
        // FMT sub-chunk
        writeUTFBytes(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        // stereo (2 channels)
        view.setUint16(22, 2, true);
        view.setUint32(24, settings.sampleRate, true);
        view.setUint32(28, settings.sampleRate * 4, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 16, true);
        // data sub-chunk
        writeUTFBytes(view, 36, 'data');
        view.setUint32(40, interleaved.length * 2, true);

        // write the PCM samples
        const lng = interleaved.length;
        let index = 44;
        const volume = 1;
        for (var i = 0; i < lng; i++) {
            view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
            index += 2;
        }

        // our final binary blob
        const blob = new Blob([view], {type: 'audio/wav'});

        return blob;
    }

    function interleave(leftChannel, rightChannel) {
        const length = leftChannel.length + rightChannel.length;
        const result = new Float32Array(length);

        let inputIndex = 0;

        for (let index = 0; index < length;) {
            result[index++] = leftChannel[inputIndex];
            result[index++] = rightChannel[inputIndex];
            inputIndex++;
        }
        return result;
    }

    function mergeBuffers(channelBuffer, recordingLength) {
        const result = new Float32Array(recordingLength);
        let offset = 0;
        const lng = channelBuffer.length;
        for (let i = 0; i < lng; i++) {
            const buffer = channelBuffer[i];
            result.set(buffer, offset);
            offset += buffer.length;
        }
        return result;
    }

    function writeUTFBytes(view, offset, string) {
        const lng = string.length;
        for (let i = 0; i < lng; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
});


async function setupFourTrack() {

    if (!navigator.getUserMedia)
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia || navigator.msGetUserMedia;

    let stream = await navigator.mediaDevices.getUserMedia({audio: true});
    console.log('Stream created');
    return FourTrack(stream);
}
