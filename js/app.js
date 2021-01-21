const UI = setupUIElements();

let fourtrack = null;

setupFourTrack().then(function (setupFourtrack) {
    fourtrack = setupFourtrack;
    UI.mainAppContainer.style.display = 'block';
    UI.startupConsole.style.display = 'none';
}).catch(function (err) {
    UI.startupConsole.textContent = err.name === 'NotAllowedError' ?
        "This app requires microphone access it to work, but you didn't grant permission. " :
        "An error has occurred setting up the app, the app requires a modern browser with javascript enabled."
});

function setupUIElements() {
    const UI = {
        recordButton: document.getElementById("record"),
        playButton: document.getElementById("play"),
        stopButton: document.getElementById("stop"),
        microphoneMute: document.getElementsByName("microphoneMute")[0],
        mainAppContainer: document.getElementById('main-app-container'),
        startupConsole: document.getElementById('startup-console'),
    }

    for (let i = 1; i <= 4; i += 1) {
        UI['trackArm' + i] = document.getElementsByName("trackArm" + i)[0];
        UI['trackMute' + i] = document.getElementsByName("trackMute" + i)[0];
        UI['trackMix' + i] = document.getElementsByName("trackMix" + i)[0];
        UI['preview' + 1] = document.getElementById('preview' + i);

        UI['preview' + 1].addEventListener("click", previewClicked);
    }

    //add events to those 2 buttons
    UI.recordButton.addEventListener("click", startRecording);
    UI.stopButton.addEventListener("click", stop);
    UI.playButton.addEventListener("click", play);
    return UI;
}


function getTrackSetup() {
    const trackSetup = {
        tracks: []
    };

    for (let i = 0; i < 4; i += 1) {
        trackSetup.tracks.push({
            muted: UI['trackMute' + (i + 1)].checked,
            mixed: UI['trackMix' + (i + 1)].checked,
            armed: UI['trackArm' + (i + 1)].checked,
        })
    }

    return trackSetup;
}


function startRecording() {
    UI.recordButton.disabled = true;
    UI.playButton.disabled = true;
    UI.stopButton.disabled = false;
    fourtrack.record(getTrackSetup());
}


function stop() {
    UI.recordButton.disabled = false;
    UI.stopButton.disabled = true;
    UI.playButton.disabled = false;
    fourtrack.stop(function (blob) {
        createDownloadLink(blob);
    });
}

function play() {
    UI.recordButton.disabled = true;
    UI.playButton.disabled = true;
    UI.stopButton.disabled = false;
    fourtrack.play(getTrackSetup());
}

function previewClicked() {
    const track = this.parentNode.dataset.track;
    fourtrack.previewTrack(track - 1);
}


function createDownloadLink(blob) {

    var url = URL.createObjectURL(blob);
    var au = document.createElement('audio');
    var li = document.createElement('li');
    var link = document.createElement('a');

    //name of .wav file to use during upload and download (without extendion)
    var filename = new Date().toISOString();

    //add controls to the <audio> element
    au.controls = true;
    au.src = url;

    //save to disk link
    link.href = url;
    link.download = filename + ".wav"; //download forces the browser to donwload the file using the  filename
    link.innerHTML = "Save to disk";

    //add the new audio element to li
    li.appendChild(au);

    //add the filename to the li
    li.appendChild(document.createTextNode(filename + ".wav "))

    //add the save to disk link to li
    li.appendChild(link);

    //upload link
    var upload = document.createElement('a');
    upload.href = "#";
    upload.innerHTML = "Upload";
    upload.addEventListener("click", function (event) {
        var xhr = new XMLHttpRequest();
        xhr.onload = function (e) {
            if (this.readyState === 4) {
                console.log("Server returned: ", e.target.responseText);
            }
        };
        var fd = new FormData();
        fd.append("audio_data", blob, filename);
        xhr.open("POST", "upload.php", true);
        xhr.send(fd);
    })
    li.appendChild(document.createTextNode(" "))//add a space in between
    li.appendChild(upload)//add the upload link to li

    //add the li element to the ol
    recordingsList.appendChild(li);
}

