#!/usr/bin/env node

import fs from 'fs';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { pipeline } from 'stream';
import minimist from 'minimist';
import fetch from 'node-fetch';
import md5 from 'md5';
import csv from 'csv-parser';
import audioconcat from 'audioconcat';
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { resolve } from 'path';

const CSV_HEADERS = ['enSentence', 'esSentence', 'audioFileHash', 'voiceId'];
const CSV_SEPARATOR = ';';
const DEFAULT_VOICE_ID = 'Joanna';
dotenv.config();
const pipelinePromise = promisify(pipeline);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function translateText(text, targetLang = 'ES') {
  console.log("💲Translating text:", text);
  const req = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'post',
    headers: {
      Authorization: `DeepL-Auth-Key ${process.env.DEEPL_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `text=${encodeURIComponent(text)}&target_lang=${targetLang}`
  });
  const data = await req.json();
  return data?.translations?.[0]?.text;
}

async function generateAudioFile(text, { folderName, filename, voiceId = DEFAULT_VOICE_ID, lang = 'es-ES' }) {
  const path = `${folderName}/${filename}.mp3`;
  if(fs.existsSync(path)) return;
  console.log("💲Generating audio:", text, `[${filename}]`);

  const client = new PollyClient({
    region: "eu-west-2",
  });
  const data = await client.send(new SynthesizeSpeechCommand({
    OutputFormat: 'mp3',
    Engine: 'neural',
    Text: text,
    TextType: 'text',
    VoiceId: voiceId,
    LanguageCode: lang,
  }));

  if (data.AudioStream) {
    console.log('✅ Success request. Saving file', path);
    await fs.promises.mkdir(folderName, { recursive: true });
    data.AudioStream.pipe(fs.createWriteStream(path));
    await delay(1000);
  }
}

/**
 * Format "sentence in english","sentence in spanish", "voiceId"
 * The only mandatory column is the first one.
 * @param {*} filename
 * @param {*} param1
 */
async function parseCsv(filename, { forceVoiceId  } = {}) {
  const results = [];
  try {
    await pipelinePromise(fs.createReadStream(filename), csv({ separator: CSV_SEPARATOR }), (stream) => {
      stream.on('data', (data) => {
        const enSentence = data.enSentence || data[0];
        const esSentence = data.esSentence || data[1];
        const voiceId = data.voiceId || data[2];
        results.push({
          enSentence,
          esSentence,
          voiceId,
        });
      });
      return Promise.resolve(results);
    });
  } catch (err) {
    throw err;
  }
  return results;
}

async function writeCsv(sentences = [], filename) {
  const data = sentences.reduce((prev, curr) => {
    return `${prev}\n"${curr.enSentence}"${CSV_SEPARATOR}"${curr.esSentence || ''}"${CSV_SEPARATOR}"${curr.audioFileHash || ''}"${CSV_SEPARATOR}"${curr.voiceId || ''}"`;
  }, `${CSV_HEADERS.join(CSV_SEPARATOR)}`);
  fs.writeFileSync(filename, data);
}


async function processSentences(
  sentences = [],
  { forceVoiceId, folderName, disableSynthesis, disableTranslation } = {}
) {
  const translatedSentences = await Promise.all(
    sentences.map(async (s) => {
      return {
        enSentence: s.enSentence,
        esSentence: s.esSentence || !disableTranslation && (await translateText(s.enSentence)),
        voiceId: s.voiceId,
        audioFileHash: md5(s.enSentence),
      };
    })
  );
  for (const s of translatedSentences) {
    if (!disableSynthesis) {
      await generateAudioFile(s.enSentence, {
        filename: s.audioFileHash,
        voiceId: forceVoiceId || s.voiceId,
        folderName: folderName + "/en",
        lang: "en-US",
      });
      await generateAudioFile(s.esSentence, {
        filename: s.audioFileHash,
        voiceId: "Lucia",
        folderName: folderName + "/es",
        lang: "es-ES",
      });
    }
  }
  return translatedSentences;
}

async function combineAudios(sentences = [], name, repetitions = 1, reverse) {
  const filename = `${name}_combined.mp3`;
  if(fs.existsSync(filename)) return;
  console.log("Generating combined audio...")
  const fileList = [];
  sentences.forEach(s => {
    let rep = 0;
    fileList.push((reverse ? `${name}/en/` : `${name}/es/`) + s.audioFileHash + '.mp3');
    fileList.push('resources/timer.mp3');
    while (rep < parseInt(repetitions)) {
      fileList.push((reverse ? `${name}/es/` : `${name}/en/`) + s.audioFileHash + '.mp3');
      fileList.push('resources/silence.mp3');
      rep++;
    }

  });
  return new Promise(async (resolve, reject) => {
    audioconcat(fileList)
      .concat(filename)
      .on('start', function (command) {
        console.log('ffmpeg process started:', command)
      })
      .on('error', function (err, stdout, stderr) {
        console.error('❌ Error:', err)
        console.error('ffmpeg stderr:', stderr)
        return reject(err);
      })
      .on('end', function (output) {
        console.error('✅ Audio created in:', output)
        return resolve();
      });
  });
}

async function main() {
  let sentences;
  const argv = minimist(process.argv.slice(2));
  const filename = argv['_'][0];
  const folderName = filename.includes('.') ? filename?.split('.')?.[0] : filename;

  if(!filename && !argv.help && !argv.h) {
    console.log('run ./sentences-audio-gen --help');
    process.exit(0);
  }
  if(argv.help || argv.h) {
    console.log('./sentences-audio-gen filename.csv --force-voice-id Matthew --concat');
    console.log('Available voices: Matthew, Joanna, Amy, Brian');
    process.exit(0);
  }

  if(filename) {
    try {
      sentences = await parseCsv(filename);
      if (argv["random-order"]) {
        sentences.sort(() => (Math.random() > .5) ? 1 : -1);
      }
      console.log(`✅ It's been read ${sentences.length} sentences`);
      sentences = await processSentences(sentences, {
        folderName,
        forceVoiceId: argv["force-voice-id"],
        disableTranslation: argv["disable-translation"],
        disableSynthesis: argv["disable-synthesis"],
      });
      await writeCsv(sentences, filename);
      if (argv.concat) {
        await combineAudios(sentences, folderName, argv["repetitions"], argv["reverse-columns"]);
      }
    } catch(err) {
      console.log(`❌ ${err.message}`);
      process.exit(1);
    }

     process.exit(0);
  }

}

main();