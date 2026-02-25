const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, VerticalAlign, HeightRule, TableBorders, TabStopType, ImageRun } = require('docx');
const sizeOf = require('image-size');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use('/generated', express.static(path.join(__dirname, 'generated')));

const generatedDir = path.join(__dirname, 'generated');

// Clean up existing generated files on server startup
if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir);
}
try {
    const files = fs.readdirSync(generatedDir);
    for (const file of files) {
        if (file !== '.gitkeep') {
            fs.unlinkSync(path.join(generatedDir, file));
        }
    }
    console.log(`Cleaned up ${files.length} old files from generated directory.`);
} catch (err) {
    console.error('Failed to clean up generated directory on startup:', err);
}

// ── Image helpers ─────────────────────────────────────────────────────────────

/**
 * Returns centered <img> HTML tags for embedding in the PDF.
 * @param {string[]} images – array of base64 data URLs
 */
const renderImagesHTML = (images) => {
    if (!images || images.length === 0) return '';
    return images.map(src =>
        `<div style="text-align:center;margin:4px 0;"><img src="${src}" style="max-width:50%;max-height:180px;width:auto;height:auto;display:block;margin:0 auto;"></div>`
    ).join('');
};

/**
 * Returns an array of centered docx Paragraphs containing ImageRun objects.
 * @param {string[]} images – array of base64 data URLs
 * @param {number} maxWidthEmu – max width in EMU (English Metric Units). 1 pt = 12700 EMU.
 */
const renderImagesWord = (images, maxWidthEmu = 1828800) => {  // ~2 inches max width
    if (!images || images.length === 0) return [];
    const paragraphs = [];
    for (const src of images) {
        try {
            // Strip data URL header and get Buffer
            const base64 = src.replace(/^data:image\/[a-z]+;base64,/, '');
            const buf = Buffer.from(base64, 'base64');

            // Detect dimensions, scale to fit maxWidthEmu maintaining aspect ratio
            let widthEmu = maxWidthEmu;
            let heightEmu = Math.round(maxWidthEmu * 0.75); // fallback 4:3
            try {
                const dims = sizeOf(buf);
                if (dims && dims.width && dims.height) {
                    const scale = maxWidthEmu / (dims.width * 9144); // px → EMU (96dpi: 1px = 9144 EMU)
                    widthEmu = Math.round(dims.width * 9144 * Math.min(scale, 1));
                    heightEmu = Math.round(dims.height * 9144 * Math.min(scale, 1));
                }
            } catch (_) { /* use defaults */ }

            // Determine image type from data URL
            const mimeMatch = src.match(/^data:image\/([a-z]+);/);
            const imgType = (mimeMatch && mimeMatch[1]) || 'png';

            paragraphs.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80, after: 80 },
                children: [
                    new ImageRun({
                        data: buf,
                        transformation: { width: Math.round(widthEmu / 9144), height: Math.round(heightEmu / 9144) },
                        type: imgType === 'jpeg' ? 'jpg' : imgType,
                    })
                ]
            }));
        } catch (e) {
            console.error('Image render error:', e.message);
        }
    }
    return paragraphs;
};
const normalizeText = (text) => {
    if (!text) return "";
    // 1. Collapse all surrounding/internal whitespace including newlines into single spaces
    // 2. Strip any trailing "CO# L#" pattern that may have been accidentally appended
    // 3. Trim then let the marker regex re-break lines where intended
    return text.trim()
        .replace(/\s+/g, ' ')
        .replace(/\s+CO\d+\s+L\d+\s*$/i, '')  // e.g. " CO1 L1" at end
        .trim();
};

// Comprehensive helper for Engineering & Math symbols
const applyMathFormatting = (str) => {
    if (!str) return "";

    // 1. Greek Symbols (Keywords like alpha -> α)
    const greekMap = {
        'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
        'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
        'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'omicron': 'ο',
        'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
        'phi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω'
    };
    let result = str;
    Object.keys(greekMap).forEach(key => {
        const reg = new RegExp(`\\b${key}\\b`, 'g');
        result = result.replace(reg, greekMap[key]);
    });

    // 2. Roots and Operators
    result = result.replace(/sqrt\(([^)]+)\)/g, '√$1');
    result = result.replace(/\bsum\b/g, '∑');
    result = result.replace(/\bint\b/g, '∫');

    // 3. Common Fractions
    const fractionMap = { '1/2': '½', '1/4': '¼', '3/4': '¾' };
    Object.keys(fractionMap).forEach(key => {
        const reg = new RegExp(key.replace('/', '\\/'), 'g');
        result = result.replace(reg, fractionMap[key]);
    });

    // 4. Exponents ^ and Subscripts _
    result = result.replace(/\^([a-zA-Z0-9]+)/g, '<sup>$1</sup>');
    result = result.replace(/_([a-zA-Z0-9]+)/g, '<sub>$1</sub>');

    return result;
};

const generateHTML = (paper, partA, partB, summary, correctGrandTotal, btlKeys, cos, btls) => {
    // Helper for Roman numerals
    const toRoman = (num) => {
        const map = { '1': 'I', '2': 'II', '3': 'III' };
        return map[num] || num;
    };

    // Helper for Date formatting (YYYY-MM-DD to DD-MM-YYYY)
    const formatDate = (dateStr) => {
        if (!dateStr) return "";
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    };

    // Helper for Semester Type
    const getSemesterType = (semStr) => {
        const evenSemesters = ['Second', 'Fourth', 'Sixth', 'Eighth', '2', '4', '6', '8'];
        const isEven = evenSemesters.some(s => semStr.toLowerCase().includes(s.toLowerCase()));
        return isEven ? "Even Semester" : "Odd Semester";
    };

    const ciaRoman = toRoman(paper.ciaType);
    const semesterType = getSemesterType(paper.semester);
    const formattedDate = formatDate(paper.date);

    // Helper to format question text with sub-question alignment
    const formatQuestionText = (text) => {
        if (!text) return "";

        // Normalize text before processing
        const normalized = normalizeText(text);

        // Auto-detect mid-line indices and force them to new lines
        const markerRegex = /\s+([a-z0-9]+\)|(?:\([a-z0-9]+\))|[ivx]+\)|(?:\([ivx]+\))|[0-9]+\.)\s+/gi;
        const processedText = normalized.replace(markerRegex, '\n$1 ');

        const lines = processedText.split('\n');
        return lines.map(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return "";

            // Matches patterns like i), (a), 1), a), 1. at beginning
            const indexRegex = /^([a-z0-9]+\)|(?:\([a-z0-9]+\))|[ivx]+\)|(?:\([ivx]+\))|[0-9]+\.)\s+/i;
            const indexMatch = trimmedLine.match(indexRegex);

            // Matches marks like (8) or (16) at end
            const marksRegex = /\s+\((\d+)\)$/;
            const marksMatch = trimmedLine.match(marksRegex);

            let index = "";
            let content = trimmedLine;
            let marks = "";

            if (indexMatch) {
                index = indexMatch[1];
                content = content.replace(indexRegex, "");
            }

            if (marksMatch) {
                marks = marksMatch[1];
                content = content.replace(marksRegex, "");
            }

            const lineStyles = `text-align: justify; text-justify: inter-word; word-break: normal; overflow-wrap: break-word; white-space: normal; line-height: 1.2;`;

            if (index || marks) {
                return `
                    <table style="width: 100%; border: none !important; border-collapse: collapse; margin-bottom: 2px; table-layout: fixed; ${lineStyles}">
                        <tr>
                            <td style="width: 25px; border: none !important; padding: 0 2px 0 0 !important; vertical-align: top; text-align: left; font-weight: normal;">${index}</td>
                            <td style="border: none !important; padding: 0 !important; text-align: justify; vertical-align: top;">${applyMathFormatting(content)}</td>
                            <td style="width: 35px; border: none !important; padding: 0 0 0 5px !important; vertical-align: top; text-align: right; font-weight: normal;">${marks ? `(${marks})` : ""}</td>
                        </tr>
                    </table>
                `;
            }

            return `<div style="${lineStyles} margin-bottom: 2px;">${applyMathFormatting(trimmedLine)}</div>`;
        }).join('');
    };

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @page { size: A4; margin: 1.5cm; }
            body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.2; margin: 0; padding: 0; color: black; }
            
            .reg-no-container { float: right; margin-bottom: 5px; }
            .reg-no-label { display: inline-block; font-weight: bold; margin-right: 8px; font-size: 11pt; }
            .reg-no-box { display: inline-block; width: 15px; height: 18px; border: 1pt solid black; margin-left: -1pt; vertical-align: middle; }
            
            .header-section { text-align: center; margin-bottom: 10px; clear: both; }
            .college-name { font-size: 16pt; font-weight: bold; text-transform: uppercase; margin: 0; }
            .autonomous { font-size: 13pt; font-weight: bold; margin: 2px 0; }
            .address { font-size: 11pt; margin-bottom: 5px; font-weight: bold; }
            .cia-title { font-size: 12pt; font-weight: bold; margin: 10px 0; }
            
            .metadata-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-weight: bold; font-size: 11pt; border: none !important; }
            .metadata-table td { padding: 4px 0; border: none !important; vertical-align: top; }
            
            .part-header { text-align: center; font-weight: bold; margin: 25px 0 5px 0; font-size: 12pt; text-transform: uppercase; }
            .part-a-instruction { text-align: center; font-weight: normal; margin-bottom: 15px; font-size: 11pt; }
            .part-b-instruction { text-align: center; font-weight: bold; margin-bottom: 15px; font-size: 11pt; }

            table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 15px; border: 1pt solid black; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; break-inside: avoid; }
            th, td { border: 1pt solid black; padding: 4px 6px; text-align: left; vertical-align: middle; }
            th { text-align: center; font-weight: bold; background-color: #f8f8f8; font-size: 10pt; }
            .center { text-align: center; }
            
            .question-text { word-wrap: break-word; line-height: 1.3; padding: 4px 10px; font-size: 11pt; text-align: justify; vertical-align: middle; }
            .question-text p { margin: 0; }
            sup, sub { font-size: 70%; line-height: 0; position: relative; vertical-align: baseline; }
            sup { top: -0.5em; }
            sub { bottom: -0.2em; }
            
            .or-row td { text-align: center; border-top: none; border-bottom: none; padding: 4px; font-size: 11pt; font-weight: normal; font-style: normal; vertical-align: middle; }
            .part-b-qbox { vertical-align: middle; text-align: center; font-weight: bold; font-size: 12pt; }
            
            .summary-table { font-size: 9pt; margin-top: 20px; page-break-inside: avoid; break-inside: avoid; }
            .summary-table th, .summary-table td { padding: 4px 2px; text-align: center; border: 1pt solid black; }
            .summary-header { font-weight: bold; margin-top: 35px; text-align: center; font-size: 11pt; text-decoration: underline; page-break-after: avoid; }
            
            .clearfix::after { content: ""; clear: both; display: table; }
        </style>
    </head>
    <body>
        <div class="clearfix" style="margin-bottom: 10px;">
            <div class="reg-no-container">
                <span class="reg-no-label">Reg. No.</span>
                <div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div><div class="reg-no-box"></div>
            </div>
        </div>
        
        <div class="header-section">
            <p class="college-name">M.I.E.T. ENGINEERING COLLEGE</p>
            <p class="autonomous">(AUTONOMOUS)</p>
            <p class="address">Tiruchirappalli-620007</p>
            <p class="cia-title">Continuous Internal Assessment – ${ciaRoman}</p>
            <p style="font-weight: bold; margin: 0;">${paper.academicYear} – ${semesterType}</p>
            <p style="font-weight: bold; margin: 4px 0 0 0;">${paper.programme}</p>
            <p style="font-weight: bold; margin: 2px 0 0 0;">${paper.semester}${paper.semester.toLowerCase().includes('semester') ? "" : " Semester"}</p>
            <p style="font-size: 12pt; font-weight: bold; margin: 12px 0; text-transform: uppercase;">${paper.courseCode} – ${paper.courseTitle}</p>
            ${paper.commonTo ? `<p style="font-weight: bold; margin: 2px 0 0 0;">Common To: ${paper.commonTo}</p>` : ""}
            ${paper.permittingNotes ? `<p style="font-weight: bold; margin: 2px 0 0 0;">(${paper.permittingNotes})</p>` : ""}
        </div>

        <table class="metadata-table">
            <tr>
                <td style="width: 50%;">Date : ${formattedDate}</td>
                <td style="width: 50%; text-align: right;">Session : ${paper.session}</td>
            </tr>
            <tr>
                <td style="width: 50%;">Time : 2 Hrs.</td>
                <td style="width: 50%; text-align: right;">Maximum Marks : 60</td>
            </tr>
        </table>

        <div class="part-header">PART-A (6 x 2 = 12 Marks)</div>
        <div class="part-a-instruction">Answer All the questions</div>
        <table>
            <thead>
                <tr>
                    <th style="width: 8%;">Q. No.</th>
                    <th style="width: 72%;">Questions</th>
                    <th style="width: 10%;">CO</th>
                    <th style="width: 10%;">BTL</th>
                </tr>
            </thead>
            <tbody>
                ${partA.map((q, i) => `
                    <tr>
                        <td class="center">${i + 1}</td>
                        <td class="question-text">${formatQuestionText(q.text)}${renderImagesHTML(q.images)}</td>
                        <td class="center">${q.co}</td>
                        <td class="center">${q.btl}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="part-header">PART-B (3 x 16 = 48 Marks)</div>
        <div class="part-b-instruction">Answer either (a) or (b) in each Question</div>
        <table>
            <colgroup>
                <col style="width: 8%;">
                <col style="width: 5%;">
                <col style="width: 67%;">
                <col style="width: 10%;">
                <col style="width: 10%;">
            </colgroup>
            <thead>
                <tr>
                    <th>Q. No.</th>
                    <th colspan="2">Questions</th>
                    <th>CO</th>
                    <th>BTL</th>
                </tr>
            </thead>
            <tfoot style="display: table-footer-group;">
                <tr><td colspan="5" style="padding: 0; margin: 0; height: 0; border: none; border-top: 1pt solid black;"></td></tr>
            </tfoot>
            <tbody>
                ${partB.map(group => {
        const aMarks = group.a.subdivisions.length === 0 ? 16 : group.a.subdivisions.reduce((s, sd) => s + parseInt(sd.marks || 0), 0);
        const bMarks = group.b.subdivisions.length === 0 ? 16 : group.b.subdivisions.reduce((s, sd) => s + parseInt(sd.marks || 0), 0);

        return `
                        <tr style="page-break-inside: auto; break-inside: auto;">
                            <td rowspan="3" class="part-b-qbox">${group.qNo}</td>
                            <td style="text-align: center; vertical-align: middle;">(a)</td>
                            <td class="question-text">
                                ${group.a.subdivisions.length === 0 ?
                `<div style="display: inline-block; width: 100%; text-align: justify; word-break: normal; overflow-wrap: break-word; line-height: 1.3; hyphens: none; vertical-align: top;">${formatQuestionText(group.a.text)}${renderImagesHTML(group.a.images)}</div>` :
                `<div style="display: inline-block; width: 100%; vertical-align: top;">
                                    ${group.a.subdivisions.map(sd => `
                                        <table style="width: 100%; border: none !important; border-collapse: collapse; margin-bottom: 0; table-layout: fixed; line-height: 1.3;">
                                            <tr>
                                                <td style="width: 25px; border: none !important; padding: 0 !important; vertical-align: top; text-align: left; font-weight: normal;">${sd.label}</td>
                                                <td style="border: none !important; padding: 0 !important; text-align: justify; vertical-align: top; word-break: normal; overflow-wrap: break-word; hyphens: none;">${formatQuestionText(sd.text)}${renderImagesHTML(sd.images)}</td>
                                                <td style="width: 35px; border: none !important; padding: 0 !important; vertical-align: top; text-align: right; font-weight: normal;">${sd.marks ? `(${sd.marks})` : ""}</td>
                                            </tr>
                                        </table>
                                    `).join('')}
                                </div>`
            }
                            </td>
                            <td rowspan="3" class="center">${group.a.co}</td>
                            <td rowspan="3" class="center">${group.a.btl}</td>
                        </tr>
                        <tr class="or-row" style="page-break-inside: avoid; break-inside: avoid;">
                            <td colspan="2" style="text-align: center; font-weight: bold;">Or</td>
                        </tr>
                        <tr style="page-break-inside: auto; break-inside: auto;">
                            <td style="text-align: center; vertical-align: middle;">(b)</td>
                            <td class="question-text">
                                ${group.b.subdivisions.length === 0 ?
                `<div style="display: inline-block; width: 100%; text-align: justify; word-break: normal; overflow-wrap: break-word; line-height: 1.3; hyphens: none; vertical-align: top;">${formatQuestionText(group.b.text)}${renderImagesHTML(group.b.images)}</div>` :
                `<div style="display: inline-block; width: calc(100% - 30px); vertical-align: top;">
                                    ${group.b.subdivisions.map(sd => `
                                        <table style="width: 100%; border: none !important; border-collapse: collapse; margin-bottom: 0; table-layout: fixed; line-height: 1.3;">
                                            <tr>
                                                <td style="width: 25px; border: none !important; padding: 0 !important; vertical-align: top; text-align: left; font-weight: normal;">${sd.label}</td>
                                                <td style="border: none !important; padding: 0 !important; text-align: justify; vertical-align: top; word-break: normal; overflow-wrap: break-word; hyphens: none;">${formatQuestionText(sd.text)}${renderImagesHTML(sd.images)}</td>
                                                <td style="width: 35px; border: none !important; padding: 0 !important; vertical-align: top; text-align: right; font-weight: normal;">${sd.marks ? `(${sd.marks})` : ""}</td>
                                            </tr>
                                        </table>
                                    `).join('')}
                                </div>`
            }
                            </td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>

        <div class="summary-header">Weightage of CO</div>
        <table class="summary-table">
            <thead>
                <tr>
                    <th style="width: 14%;">BTL</th>
                    <th style="width: 8%;"></th>
                    <th style="width: 11%;">CO1</th>
                    <th style="width: 11%;">CO2</th>
                    <th style="width: 11%;">CO3</th>
                    <th style="width: 11%;">CO4</th>
                    <th style="width: 11%;">CO5</th>
                    <th style="width: 11%;">Total Marks</th>
                    <th style="width: 12%;">Total Marks (%)</th>
                </tr>
            </thead>
            <tbody>
                ${btlKeys.map((btlKey, bIdx) => {
        let btlRowTotal = 0;
        cos.forEach(co => btlRowTotal += (summary[`${btlKey}_${co}_M`] || 0));
        const percentage = (btlRowTotal > 0 && correctGrandTotal > 0) ? ((btlRowTotal / correctGrandTotal) * 100).toFixed(2) : "";

        return `
                        <tr>
                            <td rowspan="2" style="text-align: center; font-weight: bold; vertical-align: middle;">${btls[bIdx]}</td>
                            <td style="font-weight: bold; font-size: 8pt; background-color: #fcfcfc; text-align: center;">Q. No.</td>
                            ${cos.map(co => `
                                <td>${summary[`${btlKey}_${co}_Q`].length > 0 ? summary[`${btlKey}_${co}_Q`].join(',') : ""}</td>
                            `).join('')}
                            <td></td> <!-- Total Marks cell in Q.No row is empty -->
                            <td rowspan="2" style="font-weight: bold; vertical-align: middle;">${percentage}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; font-size: 8pt; background-color: #fcfcfc; text-align: center;">Marks</td>
                            ${cos.map(co => `
                                <td>${summary[`${btlKey}_${co}_M`] > 0 ? summary[`${btlKey}_${co}_M`] : ""}</td>
                            `).join('')}
                            <td style="font-weight: bold; background-color: #fcfcfc;">${btlRowTotal > 0 ? btlRowTotal : ""}</td>
                        </tr>
                    `;
    }).join('')}
                <tr style="font-weight: bold; background-color: #f2f2f2; text-align: center;">
                    <td colspan="2">Total Marks</td>
                    ${cos.map(co => `
                        <td>${summary[`${co}_TOTAL`] > 0 ? summary[`${co}_TOTAL`] : ""}</td>
                    `).join('')}
                    <td>${correctGrandTotal > 0 ? correctGrandTotal : ""}</td>
                    <td>100</td>
                </tr>
            </tbody>
        </table>
    </body>
    `;
};

// Helper to format question text for Word (returns array of TextRuns)
const formatMathWord = (text) => {
    if (!text) return [new TextRun("")];

    // Normalize text for Word as well  
    const normalized = normalizeText(text);

    const greekMap = {
        'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
        'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
        'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'omicron': 'ο',
        'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
        'phi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω'
    };

    let resultStr = normalized;
    Object.keys(greekMap).forEach(key => {
        const reg = new RegExp(`\\b${key}\\b`, 'g');
        resultStr = resultStr.replace(reg, greekMap[key]);
    });
    resultStr = resultStr.replace(/sqrt\(([^)]+)\)/g, '√$1');
    resultStr = resultStr.replace(/\bsum\b/g, '∑');
    resultStr = resultStr.replace(/\bint\b/g, '∫');

    const fractionMap = { '1/2': '½', '1/4': '¼', '3/4': '¾' };
    Object.keys(fractionMap).forEach(key => {
        const reg = new RegExp(key.replace('/', '\\/'), 'g');
        resultStr = resultStr.replace(reg, fractionMap[key]);
    });

    const runs = [];
    let currentPos = 0;
    const regex = /(\^|_)({([^}]+)}|([a-zA-Z0-9]+))/g;
    let match;

    while ((match = regex.exec(resultStr)) !== null) {
        if (match.index > currentPos) {
            runs.push(new TextRun({ text: resultStr.substring(currentPos, match.index) }));
        }
        const type = match[1];
        const content = match[3] || match[4];
        runs.push(new TextRun({ text: content, superScript: type === '^', subScript: type === '_' }));
        currentPos = regex.lastIndex;
    }
    if (currentPos < resultStr.length) {
        runs.push(new TextRun({ text: resultStr.substring(currentPos) }));
    }
    return runs;
};

const generateWord = async (paper, partA, partB, summary, correctGrandTotal, btlKeys, cos, btls) => {
    const toRoman = (num) => ({ '1': 'I', '2': 'II', '3': 'III' }[num] || num);
    const formatDate = (dateStr) => {
        if (!dateStr) return "";
        const parts = dateStr.split('-');
        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
    };
    const getSemesterType = (semStr) => {
        const evenSemesters = ['Second', 'Fourth', 'Sixth', 'Eighth', '2', '4', '6', '8'];
        const isEven = evenSemesters.some(s => semStr.toLowerCase().includes(s.toLowerCase()));
        return isEven ? "Even Semester" : "Odd Semester";
    };

    // Helper to create a borderless cell (all 6 directions must be NONE to avoid boxes in Word)
    const noBorder = {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
    };

    // Header Content Table (Centered, Bold rules)
    const mkHdrRow = (text, size, bold = true) => new TableRow({
        children: [new TableCell({
            borders: noBorder,
            children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0, line: 240, lineRule: "auto" },
                children: [new TextRun({ text, bold, size })]
            })]
        })]
    });

    const headerRows = [
        mkHdrRow("M.I.E.T. ENGINEERING COLLEGE", 28),
        mkHdrRow("(AUTONOMOUS)", 22),
        mkHdrRow("Tiruchirappalli-620007", 20),
        mkHdrRow(`Continuous Internal Assessment – ${toRoman(paper.ciaType)}`, 24),
        mkHdrRow(`${paper.academicYear} – ${getSemesterType(paper.semester)}`, 20),
        mkHdrRow(paper.programme, 20),
        mkHdrRow(`${paper.semester}${paper.semester.toLowerCase().includes('semester') ? "" : " Semester"}`, 20),
        mkHdrRow(`${paper.courseCode.toUpperCase()} – ${paper.courseTitle.toUpperCase()}`, 24),
    ];

    if (paper.commonTo) {
        headerRows.push(mkHdrRow(`Common to: ${paper.commonTo}`, 20));
    }

    if (paper.permittingNotes) {
        headerRows.push(mkHdrRow(`(${paper.permittingNotes})`, 20));
    }

    const headerTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: "fixed",
        borders: noBorder,
        rows: headerRows
    });

    // Metadata Grid (2 Column)
    const metadataTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: "fixed",
        borders: noBorder,
        columnWidths: [4500, 4500],
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        borders: noBorder,
                        children: [
                            new Paragraph({ children: [new TextRun({ text: `Date : ${formatDate(paper.date)}`, bold: true, size: 22 })] }),
                            new Paragraph({ children: [new TextRun({ text: "Time : 2 Hrs.", bold: true, size: 22 })] })
                        ]
                    }),
                    new TableCell({
                        borders: noBorder,
                        children: [
                            new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Session : ${paper.session}`, bold: true, size: 22 })] }),
                            new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Maximum Marks : 60", bold: true, size: 22 })] })
                        ]
                    })
                ]
            })
        ]
    });

    // Part A Header
    const partAHeader = new Paragraph({
        alignment: AlignmentType.CENTER,
        shading: { fill: "F3F4F6" },
        children: [new TextRun({ text: "PART-A (6 x 2 = 12 Marks)", bold: true, size: 24 })],
        spacing: { before: 200, after: 100 }
    });
    const partAInstruction = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Answer All the questions", size: 22 })],
        spacing: { after: 200 }
    });

    const tableHeaderColor = "F8F8F8";
    const borderSettings = {
        top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" }
    };

    // Standard cell padding – matches the PDF's inner spacing (twips: 1pt ≈ 20 twips)
    const cellPad = { top: 80, bottom: 80, left: 120, right: 120 };

    // Part A Table
    const partATable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: "fixed",
        columnWidths: [720, 6480, 900, 900], // 8%, 72%, 10%, 10% approx
        borders: borderSettings,
        rows: [
            new TableRow({
                tableHeader: true,
                children: [
                    new TableCell({ margins: cellPad, shading: { fill: tableHeaderColor }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Q. No.", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ margins: cellPad, shading: { fill: tableHeaderColor }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Questions", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ margins: cellPad, shading: { fill: tableHeaderColor }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CO", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ margins: cellPad, shading: { fill: tableHeaderColor }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BTL", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                ]
            }),
            ...partA.map(q => new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({ margins: cellPad, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.qNo, size: 22 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ margins: cellPad, children: [new Paragraph({ alignment: AlignmentType.BOTH, children: formatMathWord(q.text) }), ...renderImagesWord(q.images)], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ margins: cellPad, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.co, size: 22 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ margins: cellPad, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.btl, size: 22 })] })], verticalAlign: VerticalAlign.CENTER }),
                ]
            }))
        ]
    });

    // Part B Header
    const partBHeader = new Paragraph({
        alignment: AlignmentType.CENTER,
        shading: { fill: "F3F4F6" },
        children: [new TextRun({ text: "PART-B (3 x 16 = 48 Marks)", bold: true, size: 24 })],
        spacing: { before: 200, after: 100 }
    });
    const partBInstruction = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Answer either (a) or (b) in each Question", italic: true, bold: true, size: 22 })],
        spacing: { after: 200 }
    });

    // Part B Table
    const partBTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: "fixed",
        columnWidths: [720, 620, 5860, 900, 900], // Q.No, (a)/(b) label, Question text, CO, BTL
        borders: borderSettings,
        rows: [
            new TableRow({
                tableHeader: true,
                children: [
                    new TableCell({ shading: { fill: tableHeaderColor }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Q. No.", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ columnSpan: 2, shading: { fill: tableHeaderColor }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Questions", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ shading: { fill: tableHeaderColor }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CO", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ shading: { fill: tableHeaderColor }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BTL", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                ]
            }),
            ...partB.flatMap((group) => {
                const renderContent = (sub) => {
                    const subs = group[sub].subdivisions || [];
                    const imgs = group[sub].images || [];
                    if (subs.length === 0) {
                        return [
                            new Paragraph({
                                alignment: AlignmentType.BOTH,
                                spacing: { before: 0, after: 0 },
                                children: formatMathWord(group[sub].text),
                            }),
                            ...renderImagesWord(imgs)
                        ];
                    }

                    // Nested 3-column table: label | content | marks
                    // Borders suppressed at BOTH table level AND cell level
                    // This mirrors the PDF layout where (8) stays right-aligned
                    // even when content text wraps to multiple lines.
                    return [
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            layout: "fixed",
                            borders: noBorder,          // suppress w:tblBdr (table-level borders)
                            columnWidths: [350, 5280, 450],
                            rows: subs.map(sd => new TableRow({
                                cantSplit: true,
                                children: [
                                    new TableCell({
                                        borders: noBorder,
                                        verticalAlign: VerticalAlign.TOP,
                                        children: [new Paragraph({
                                            spacing: { before: 0, after: 0 },
                                            children: [new TextRun({ text: sd.label })]
                                        })]
                                    }),
                                    new TableCell({
                                        borders: noBorder,
                                        verticalAlign: VerticalAlign.TOP,
                                        children: [
                                            new Paragraph({
                                                alignment: AlignmentType.BOTH,
                                                spacing: { before: 0, after: 0 },
                                                children: formatMathWord(sd.text)
                                            }),
                                            ...renderImagesWord(sd.images)
                                        ]
                                    }),
                                    new TableCell({
                                        borders: noBorder,
                                        verticalAlign: VerticalAlign.TOP,
                                        children: [new Paragraph({
                                            alignment: AlignmentType.RIGHT,
                                            spacing: { before: 0, after: 0 },
                                            children: [new TextRun({ text: sd.marks ? `(${sd.marks})` : "" })]
                                        })]
                                    })
                                ]
                            }))
                        })
                    ];
                };

                return [
                    new TableRow({
                        cantSplit: false,
                        children: [
                            new TableCell({ margins: cellPad, rowSpan: 3, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: group.qNo.toString(), size: 22, bold: true })] })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ margins: cellPad, children: [new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, children: [new TextRun({ text: "(a)" })] })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ margins: cellPad, children: renderContent('a'), verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ margins: cellPad, rowSpan: 3, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: group.a.co, size: 22 })] })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ margins: cellPad, rowSpan: 3, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: group.a.btl, size: 22 })] })], verticalAlign: VerticalAlign.CENTER }),
                        ]
                    }),
                    new TableRow({ cantSplit: true, children: [new TableCell({ margins: cellPad, columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Or", bold: true, size: 22 })] })], verticalAlign: VerticalAlign.CENTER })] }),
                    new TableRow({ cantSplit: false, children: [new TableCell({ margins: cellPad, children: [new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, children: [new TextRun({ text: "(b)" })] })], verticalAlign: VerticalAlign.CENTER }), new TableCell({ margins: cellPad, children: renderContent('b'), verticalAlign: VerticalAlign.CENTER })] }),
                ];
            })
        ]
    });

    // Summary Table (CO/BTL Mapping)
    // keepNext keeps the header attached to the table; the table rows use cantSplit so
    // Word will push the entire Weightage of CO section to the next page if it doesn't fit.
    const summaryHeader = new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,        // glue header to first table row so they never separate
        children: [new TextRun({ text: "Weightage of CO", bold: true, size: 22, underline: {} })],
        spacing: { before: 400, after: 200 }
    });
    const summaryTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: "fixed",
        columnWidths: [1800, 1000, 1000, 1000, 1000, 1000, 1000, 1200, 1000],
        borders: borderSettings,
        rows: [
            new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BTL", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ text: "" })], verticalAlign: VerticalAlign.CENTER }), // Empty cell above Q.No/Marks
                    ...cos.map(co => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: co, bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER })),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Total Marks", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Total Marks (%)", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                ]
            }),
            ...btlKeys.flatMap((btlKey, i) => {
                let btlRowTotal = 0;
                cos.forEach(co => btlRowTotal += (summary[`${btlKey}_${co}_M`] || 0));
                const percentage = (btlRowTotal > 0 && correctGrandTotal > 0) ? ((btlRowTotal / correctGrandTotal) * 100).toFixed(2) : "";

                return [
                    new TableRow({
                        cantSplit: true,
                        children: [
                            new TableCell({ rowSpan: 2, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: btls[i], bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Q. No.", bold: true, size: 16 })] })], verticalAlign: VerticalAlign.CENTER }),
                            ...cos.map(co => {
                                const qs = summary[`${btlKey}_${co}_Q`].join(',');
                                return new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: qs, size: 20 })] })], verticalAlign: VerticalAlign.CENTER });
                            }),
                            new TableCell({ children: [new Paragraph({ text: "" })], verticalAlign: VerticalAlign.CENTER }), // Empty top total cell
                            new TableCell({ rowSpan: 2, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: percentage, bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER })
                        ]
                    }),
                    new TableRow({
                        cantSplit: true,
                        children: [
                            new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Marks", bold: true, size: 16 })] })], verticalAlign: VerticalAlign.CENTER }),
                            ...cos.map(co => {
                                const ms = summary[`${btlKey}_${co}_M`];
                                return new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ms > 0 ? ms.toString() : "", size: 20 })] })], verticalAlign: VerticalAlign.CENTER });
                            }),
                            new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: btlRowTotal > 0 ? btlRowTotal.toString() : "", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER })
                        ]
                    })
                ];
            }),
            new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({ columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Total Marks", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    ...cos.map(co => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: summary[`${co}_TOTAL`] > 0 ? summary[`${co}_TOTAL`].toString() : "", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER })),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: correctGrandTotal > 0 ? correctGrandTotal.toString() : "", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "100.00", bold: true, size: 20 })] })], verticalAlign: VerticalAlign.CENTER }),
                ]
            })
        ]
    });


    const doc = new Document({
        creator: "CIA Generator",
        styles: {
            default: {
                document: {
                    run: {
                        font: "Times New Roman",
                        size: 24, // 12pt
                    },
                    paragraph: {
                        spacing: { before: 0, after: 0, line: 240, lineRule: "auto" }, // Single spacing, 0 before/after
                    },
                },
            },
        },
        sections: [{
            properties: {
                page: {
                    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch = 1440 twips
                    size: { width: 11906, height: 16838 } // A4
                }
            },
            children: [
                headerTable,
                new Paragraph({ spacing: { before: 100 } }),
                metadataTable,
                new Paragraph({ spacing: { before: 100 } }),
                partAHeader,
                partAInstruction,
                partATable,
                partBHeader,
                partBInstruction,
                partBTable,
                summaryHeader,
                summaryTable
            ]
        }]
    });
    return Packer.toBuffer(doc);
};

app.post('/api/papers', async (req, res) => {
    try {
        console.log('--- REFINED PDF GENERATOR ACTIVE ---');
        const { header, partA, partB, fileName } = req.body;

        const paper = await prisma.cIAPaper.create({
            data: {
                academicYear: header.academicYear,
                ciaType: header.ciaType,
                courseCode: header.courseCode,
                courseTitle: header.courseTitle,
                programme: header.programme,
                semester: header.semester,
                date: header.date,
                session: header.session,
                questions: {
                    create: [
                        ...partA.map(q => {
                            const { images: _imgs, ...dbQ } = q; // strip images — not in DB schema
                            return { ...dbQ, part: 'A', marks: 2 };
                        }),
                        ...partB.flatMap(q => [
                            {
                                qNo: q.qNo + 'a',
                                part: 'B',
                                co: q.a.co,
                                btl: q.a.btl,
                                marks: q.a.subdivisions.length === 0 ? 16 : q.a.subdivisions.reduce((sum, sd) => sum + parseInt(sd.marks || 0), 0),
                                text: q.a.subdivisions.length === 0 ? q.a.text : q.a.subdivisions.map(sd => `${sd.label} ${sd.text} (${sd.marks})`).join('\n')
                            },
                            {
                                qNo: q.qNo + 'b',
                                part: 'B',
                                co: q.b.co,
                                btl: q.b.btl,
                                marks: q.b.subdivisions.length === 0 ? 16 : q.b.subdivisions.reduce((sum, sd) => sum + parseInt(sd.marks || 0), 0),
                                text: q.b.subdivisions.length === 0 ? q.b.text : q.b.subdivisions.map(sd => `${sd.label} ${sd.text} (${sd.marks})`).join('\n')
                            }
                        ])
                    ]
                }
            },
            include: { questions: true }
        });


        const cos = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
        const btls = ['Remember (L1)', 'Understand (L2)', 'Apply (L3)', 'Analyze (L4)'];
        const btlKeys = ['L1', 'L2', 'L3', 'L4'];

        const summary = {};
        cos.forEach(co => {
            btlKeys.forEach(btl => {
                summary[`${btl}_${co}_Q`] = [];
                summary[`${btl}_${co}_M`] = 0;
            });
            summary[`${co}_TOTAL`] = 0;
        });

        const processQuestion = (q, marks) => {
            if (cos.includes(q.co) && btlKeys.includes(q.btl)) {
                if (!summary[`${q.btl}_${q.co}_Q`].includes(q.qNo)) {
                    summary[`${q.btl}_${q.co}_Q`].push(q.qNo);
                }
                summary[`${q.btl}_${q.co}_M`] += marks;
                summary[`${q.co}_TOTAL`] += marks;
            }
        };

        let correctGrandTotal = 0;
        partA.forEach((q, i) => {
            const marks = 2;
            processQuestion({ ...q, qNo: (i + 1).toString() }, marks);
            correctGrandTotal += marks;
        });

        partB.forEach(group => {
            const aMarks = group.a.subdivisions.length === 0 ? 16 : group.a.subdivisions.reduce((sum, sd) => sum + parseInt(sd.marks || 0), 0);
            processQuestion({ ...group.a, qNo: group.qNo }, aMarks);
            correctGrandTotal += aMarks;

            if (group.b.co !== group.a.co || group.b.btl !== group.a.btl) {
                processQuestion({ ...group.b, qNo: group.qNo }, 0);
            }
        });



        const paperData = {
            ...paper,
            commonTo: header.commonTo,
            permittingNotes: header.permittingNotes
        };

        // Generate Files
        const baseName = fileName || `paper_${paper.id}`;
        const pdfFileName = `${baseName}.pdf`;
        const wordFileName = `${baseName}.docx`;
        const pdfFilePath = path.join(generatedDir, pdfFileName);
        const wordFilePath = path.join(generatedDir, wordFileName);

        // 1. PDF Generation
        const htmlContent = generateHTML(paperData, partA, partB, summary, correctGrandTotal, btlKeys, cos, btls);
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent);
        await page.pdf({
            path: pdfFilePath,
            format: 'A4',
            printBackground: true,
            margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' }
        });
        await browser.close();

        // 2. Word Generation
        const wordBuffer = await generateWord(paperData, partA, partB, summary, correctGrandTotal, btlKeys, cos, btls);
        fs.writeFileSync(wordFilePath, wordBuffer);

        await prisma.cIAPaper.update({
            where: { id: paper.id },
            data: { filePath: pdfFileName }
        });

        // Automatically delete the generated files after 5 minutes to prevent disk bloat
        setTimeout(() => {
            try {
                if (fs.existsSync(pdfFilePath)) fs.unlinkSync(pdfFilePath);
                if (fs.existsSync(wordFilePath)) fs.unlinkSync(wordFilePath);
                console.log(`Cleaned up generated files: ${pdfFileName}, ${wordFileName}`);
            } catch (err) {
                console.error(`Error cleaning up files:`, err);
            }
        }, 5 * 60 * 1000);

        res.json({
            id: paper.id,
            pdfUrl: `/generated/${encodeURIComponent(pdfFileName)}`,
            wordUrl: `/generated/${encodeURIComponent(wordFileName)}`
        });

    } catch (error) {
        console.error('SERVER ERROR:', error);
        console.error(error.stack);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/papers', async (req, res) => {
    const papers = await prisma.cIAPaper.findMany({
        orderBy: { createdAt: 'desc' }
    });
    res.json(papers);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running - Listening on all network interfaces (0.0.0.0) at port ${PORT}`);
    console.log(`You can access it locally at http://localhost:${PORT}`);
    
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`You can access it on your network at http://${net.address}:${PORT}`);
            }
        }
    }

    console.log('Refined Header Logic Loaded: Bold Address, DD-MM-YYYY Date, Roman numerals');
});
