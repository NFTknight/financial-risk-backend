/*
 * Module Imports
 * */
const PDFDocument = require('pdfkit');
let PdfTable = require('voilab-pdf-table');
const VoilabPdfTable = require('voilab-pdf-table/plugins/fitcolumn');
const axios = require('axios');

/*
 * Local Imports
 * */
const config = require('../config');
const { numberWithCommas } = require('./report.helper');

const generateDecisionLetter = async ({
  approvalStatus,
  rejectionReason,
  clientName,
  debtorName,
  abn,
  acn,
  registrationNumber,
  requestedAmount,
  approvedAmount,
  status,
  serviceManagerNumber,
  country,
  tradingName,
  requestedDate,
  approvalOrDecliningDate,
  expiryDate,
}) => {
  const pdfBuffer = await new Promise(async (resolve) => {
    const date = new Date();
    let buffer;
    let pdf = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
    });
    const table = new PdfTable(pdf);
    let buffers = [];
    // const width = pdf.widthOfString(orderData.items);
    // const h = pdf.heightOfString(orderData.items,{width});
    pdf.addPage({
      size: [595.28, 841.89],
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    });
    table
      .addPlugin(new VoilabPdfTable())
      // set defaults to your columns
      .setColumnsDefaults({
        padding: [4, 0, 0, 20],
      })
      .addColumns([
        {
          id: 'column1',
          width: 277,
          align: 'left',
        },
        {
          id: 'column2',
          width: 277,
          align: 'right',
        },
      ]);
    /*Top Border Starts*/
    pdf.rect(0, 0, 595.28, 15.6).fillOpacity(1).fill('#123A78');
    pdf.rect(0, 15.6, 595.28, 15.6).fillOpacity(1).fill('#EF7B11');
    /*Top Border Ends*/
    /*Header with Logo Starts*/
    pdf.rect(0, 31.2, 595.28, 69).fillOpacity(1).fill('#F4F6F8');
    buffer = await getBase64(
      `${config.staticServing.bucketURL}static-files/mail-images/trad-logo.png`,
    );
    pdf.image(buffer, 30, 52, { fit: [250, 250] });
    pdf.fill('#EF7B10').font('Helvetica-Bold');
    pdf.text(
      `Date: ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`,
      490,
      70,
      {},
    );
    /*Header with Logo Ends*/
    /*Page Title with Client Starts*/
    pdf.rect(0, 100.2, 595.28, 62).fillOpacity(1).fill('#003A78');
    // table.plugins[1].shade1 = '#F4F6F8'
    // table.plugins[1].x = 0
    //   pdf.moveDown(3);
    pdf.fill('#FFFFFF').font('Helvetica-Bold').fontSize(15);
    pdf.text('Credit Check', 0, 110, {
      align: 'center',
    });
    pdf.moveDown(0.5);
    pdf.text(`${clientName}`, {
      align: 'center',
    });
    /*Page Title with Client Ends*/
    /*Debtor Details Starts*/
    pdf.moveDown(1.0);
    pdf.fill('#003A78').font('Helvetica').fontSize(11.25);
    pdf.text(`Debtor Name: ${debtorName}`, {
      align: 'center',
    });
    if (tradingName) {
      pdf.moveDown(0.3);
      pdf.text(`Name: ${tradingName}`, {
        align: 'center',
      });
    }
    const tableData = [];
    if (registrationNumber) {
      pdf.moveDown(0.3);
      pdf.text(`Registration Number: ${registrationNumber}`, {
        align: 'center',
      });
    } else {
      const companyNumbers = {};
      if (acn) {
        companyNumbers.column2 = `${
          country === 'AUS' ? 'ACN:' : 'NCN:'
        } ${acn}`;
      }
      if (abn) {
        companyNumbers.column1 = `${
          country === 'AUS' ? 'ABN:' : 'NZBN:'
        } ${abn}`;
      }
      tableData.push(companyNumbers);
    }
    if (requestedDate) {
      tableData.push({
        column1: `Requested Date: ${requestedDate.getDate()}/${
          requestedDate.getMonth() + 1
        }/${requestedDate.getFullYear()}`,
        column2: `${
          status === 'DECLINED' ? 'Declining' : 'Approved'
        } Date: ${approvalOrDecliningDate.getDate()}/${
          approvalOrDecliningDate.getMonth() + 1
        }/${approvalOrDecliningDate.getFullYear()}`,
      });
    }
    if (expiryDate && status !== 'DECLINED') {
      tableData.push({
        column1: `Expiry Date: ${expiryDate.getDate()}/${
          expiryDate.getMonth() + 1
        }/${expiryDate.getFullYear()}`,
      });
    }
    table.addBody(tableData);

    pdf.moveDown(0.3);
    /*Debtor Details Ends*/
    /*Applied Limit Starts*/
    pdf.y = pdf.y + 3;
    pdf.rect(0, pdf.y, 595.28, 62).fillOpacity(1).fill('#F4F6F8');
    // table.plugins[1].shade1 = '#F4F6F8'
    // table.plugins[1].x = 0
    //   pdf.moveDown(3);
    pdf.y = pdf.y + 15;
    pdf.fill('#828F9D').font('Helvetica-Bold').fontSize(11.25);
    pdf.text('Credit Limit Request:', 0, pdf.y, {
      align: 'center',
    });
    pdf.moveDown(0.5);
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(19);
    pdf.text(`$${numberWithCommas(requestedAmount)} AUD`, {
      align: 'center',
    });
    /*Applied Limit Ends*/
    /*Applied Limit Starts*/
    pdf.y = pdf.y + 12;
    pdf.rect(0, pdf.y, 595.28, 62).fillOpacity(1).fill('#F4F6F8');
    // table.plugins[1].shade1 = '#F4F6F8'
    // table.plugins[1].x = 0
    //   pdf.moveDown(3);
    pdf.y = pdf.y + 14;
    pdf.fill('#828F9D').font('Helvetica-Bold').fontSize(11.25);
    pdf.text('Credit Limit Opinion:', 0, pdf.y, {
      align: 'center',
    });
    pdf.moveDown(0.5);
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(19);
    pdf.text(`$${numberWithCommas(approvedAmount)} AUD`, {
      align: 'center',
    });
    /*Applied Limit Ends*/
    /*Summary Starts*/
    pdf.y = pdf.y + 14;
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(11.25);
    pdf.text('Summary:', 20, pdf.y, {
      // align: 'center',
    });
    pdf.moveDown(0.6);
    pdf.fill('#828F9D').font('Helvetica').fontSize(11.25);
    if (status === 'DECLINED') {
      pdf.text(
        `After careful analysis, we are unable to provide a recommendation of $${numberWithCommas(
          requestedAmount,
        )} on ${debtorName} based on the following adverse information:`,
        {
          // align: 'center',
        },
      );
    } else if (status === 'APPROVED') {
      pdf.text(
        `After careful analysis, we are pleased to provide a recommendation of $${numberWithCommas(
          approvedAmount,
        )} on ${debtorName}`,
        {
          // align: 'center',
        },
      );
    } else if (status === 'PARTIALLY_APPROVED') {
      pdf.text(
        `After careful analysis, we are pleased to provide a recommendation of $${numberWithCommas(
          approvedAmount,
        )} on ${debtorName}`,
        {
          // align: 'center',
        },
      );
    }
    pdf.moveDown(0.6);
    pdf.fill('#FE5050').font('Helvetica').fontSize(11.25);
    if (status === 'DECLINED' && rejectionReason) {
      pdf.text(rejectionReason, {
        // align: 'center',
      });
    } else if (approvalStatus) {
      pdf.text(approvalStatus, {
        // align: 'center',
      });
    }
    pdf.moveDown(0.6);
    pdf.fill('#828F9D').font('Helvetica').fontSize(11.25);
    pdf.text(
      'Our sources include ASIC, illion and the TCR Internal Database.',
      {
        // align: 'center',
      },
    );
    /*Summary Ends*/
    /*Conditions of Opinion Starts*/
    pdf.moveDown(1.6);
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(11.25);
    pdf.text('Conditions of Opinion', {
      // align: 'center',
    });
    pdf.moveDown(0.6);
    pdf.fill('#828F9D').font('Helvetica').fontSize(11.25);
    if (status === 'DECLINED') {
      pdf.text(
        `We highly recommend you cease trading with this debtor immediately. TCR can review this
debtor at your request once further information can be provided. This debtor has been added
to our database for monitoring purposes and we will inform you of any updates we receive.
Please contact your Service Manager${
          serviceManagerNumber ? ' on ' + serviceManagerNumber : ''
        } to discuss further.`,
        {
          // align: 'center',
        },
      );
    } else if (status === 'PARTIALLY_APPROVED' || status === 'APPROVED') {
      pdf.text(
        `The above opinion will be expired after 12 months. A review of your trading history will be required to support your credit limit. This debtor has been added to our database for monitoring purposes and we will inform you of any updates we receive. Please contact your Service Manager${
          serviceManagerNumber ? ' on ' + serviceManagerNumber : ''
        } for further information`,
        {
          // align: 'center',
        },
      );
    }
    /*Conditions of Opinion Ends*/
    /*Licence Detail Starts*/
    pdf.moveDown(2);
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(12);
    pdf.text('Australian Financial Services Licence #: 422672', 0, 715, {
      align: 'center',
    });
    /*Licence of Opinion Ends*/
    /*Footer Starts*/
    pdf.rect(0, 735, 595.28, 107).fillOpacity(1).fill('#EF7B10');
    // table.plugins[1].shade1 = '#F4F6F8'
    // table.plugins[1].x = 0
    //   pdf.moveDown(3);
    pdf.fill('#FFFFFF').font('Helvetica').fontSize(12.75);
    buffer = await getBase64(
      `${config.staticServing.bucketURL}static-files/mail-images/phone-icon.png`,
    );
    pdf.image(buffer, 233, 760, { fit: [18, 18] });
    pdf.text('(03) 9842 0986', 0, 762, {
      align: 'center',
    });
    pdf.moveDown(0.4);
    buffer = await getBase64(
      `${config.staticServing.bucketURL}static-files/mail-images/message-icon.png`,
    );
    pdf.image(buffer, 178, 778, { fit: [17, 17] });
    pdf.text('creditlimits@tradecreditrisk.com.au', {
      align: 'center',
    });
    pdf.moveDown(0.4);
    buffer = await getBase64(
      `${config.staticServing.bucketURL}static-files/mail-images/location-icon.png`,
    );
    pdf.image(buffer, 108, 798, { fit: [17, 17] });
    pdf.text('Suite 11, 857 Doncaster Road Doncaster East, Victoria 3109', {
      align: 'center',
    });
    /*Footer Ends*/
    pdf.on('data', buffers.push.bind(buffers));
    pdf.on('end', async () => {
      let pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });
    pdf.end();
  });
  return await pdfBuffer;
};

const getBase64 = async (url) => {
  try {
    const image = await axios.get(url, { responseType: 'arraybuffer' });
    let raw = Buffer.from(image.data).toString('base64');
    return 'data:' + image.headers['content-type'] + ';base64,' + raw;
  } catch (e) {
    console.log('Error occurred in get base 64', e);
  }
};

module.exports = { generateDecisionLetter, getBase64 };
