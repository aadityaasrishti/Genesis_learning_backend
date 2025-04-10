const csv = require("csv-parse");
const { Readable } = require("stream");

const parseCsv = (fileContent) => {
  return new Promise((resolve, reject) => {
    const records = [];
    const parser = csv({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    parser.on("readable", () => {
      let record;
      while ((record = parser.read()) !== null) {
        records.push(record);
      }
    });

    parser.on("error", (err) => {
      reject(err);
    });

    parser.on("end", () => {
      resolve(records);
    });

    const stream = new Readable();
    stream.push(fileContent);
    stream.push(null);
    stream.pipe(parser);
  });
};

module.exports = { parseCsv };
