#!/usr/bin/env node

import dotenv from 'dotenv';
import minimist from 'minimist';
import fetch from 'node-fetch';
import md5 from 'md5';
import csv from 'csv-parser';
dotenv.config();


function translate(text, targetLang = 'es') {

}

function generateAudioFile(text, folder, filename, voiceId) {

}


function parseCsv(filename, { forceVoiceId  }) {

}


function processSentences(sentences = [], { forceVoiceId }) {

}

async function main() {
  const argv = minimist(process.argv.slice(2));
console.log(argv)
}

main();