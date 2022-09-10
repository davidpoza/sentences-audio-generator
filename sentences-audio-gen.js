#!/usr/bin/env node

import fs from 'fs';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { pipeline, Readable } from 'stream';
import minimist from 'minimist';
import fetch from 'node-fetch';
import md5 from 'md5';
import csv from 'csv-parser';

const CSV_HEADERS = ['enSentence', 'esSentence', 'voiceId'];
const DEFAULT_VOICE_ID = 'Joanna';

dotenv.config();
const pipelinePromise = promisify(pipeline);

function translate(text, targetLang = 'es') {

}

function generateAudioFile(text, folder, filename, voiceId) {

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
    await pipelinePromise(fs.createReadStream(filename), csv(CSV_HEADERS), (stream) => {
      stream.on('data', (data) => {
        const enSentence = data.enSentence || data[0];
        const esSentence = data.esSentence || data[1];
        const voiceId = data.voiceId || data[2];
        results.push({
          enSentence,
          esSentence,
          voiceId
        });
      });
      return Promise.resolve(results);
    });
  } catch (err) {
    throw err;
  }
  return results;
}


function processSentences(sentences = [], { forceVoiceId } = {}) {

}

async function main() {
  let sentences;
  const argv = minimist(process.argv.slice(2));
  const filename = argv['_'][0];

  if(!filename && !argv.help && !argv.h) {
    console.log('run ./sentences-audio-gen --help');
    process.exit(0);
  }
  if(argv.help || argv.h) {
    console.log('./sentences-audio-gen filename.csv -voiceId Matthew');
    console.log('Available voices: Matthew, Joanna, Amy, Brian');
    process.exit(0);
  }

  if(filename) {
    try {
      sentences = await parseCsv(filename);
      console.log(`It's been read ${sentences.length} sentences`);
    } catch(err) {
      console.log(err.message);
    }
    // console.log(sentences )
  }

}

main();