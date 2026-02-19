const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use('/generated', express.static(path.join(__dirname, 'generated')));

const generatedDir = path.join(__dirname, 'generated');
if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir);
}

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

        // Auto-detect mid-line indices and force them to new lines
        const markerRegex = /\s+([a-z0-9]+\)|(?:\([a-z0-9]+\))|[ivx]+\)|(?:\([ivx]+\))|[0-9]+\.)\s+/gi;
        const normalizedText = text.replace(markerRegex, '\n$1 ');

        const lines = normalizedText.split('\n');
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

            if (index || marks) {
                return `
                    <table style="width: 100%; border: none !important; border-collapse: collapse; margin-bottom: 0; table-layout: fixed; line-height: 1.2;">
                        <tr>
                            <td style="width: 25px; border: none !important; padding: 0 2px 0 0 !important; vertical-align: top; text-align: left; font-weight: normal;">${index}</td>
                            <td style="border: none !important; padding: 0 !important; text-align: justify; vertical-align: top;">${applyMathFormatting(content)}</td>
                            <td style="width: 35px; border: none !important; padding: 0 0 0 5px !important; vertical-align: top; text-align: right; font-weight: normal;">${marks ? `(${marks})` : ""}</td>
                        </tr>
                    </table>
                `;
            }

            return `<div style="text-align: justify; margin-bottom: 0; line-height: 1.2;">${applyMathFormatting(trimmedLine)}</div>`;
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
            
            .metadata-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-weight: bold; font-size: 11pt; }
            .metadata-table td { padding: 4px 0; border: none !important; vertical-align: top; }
            
            .part-header { text-align: center; font-weight: bold; margin: 25px 0 5px 0; font-size: 12pt; text-transform: uppercase; }
            .part-a-instruction { text-align: center; font-weight: normal; margin-bottom: 15px; font-size: 11pt; }
            .part-b-instruction { text-align: center; font-weight: bold; margin-bottom: 15px; font-size: 11pt; }

            table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 15px; page-break-inside: auto; break-inside: auto; }
            thead { display: table-header-group; }
            tr { page-break-inside: auto; break-inside: auto; }
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
                        <td class="question-text">${formatQuestionText(q.text)}</td>
                        <td class="center">${q.co}</td>
                        <td class="center">${q.btl}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="part-header">PART-B (3 x 16 = 48 Marks)</div>
        <div class="part-b-instruction">Answer either (a) or (b) in each Question</div>
        <table>
            <thead>
                <tr>
                    <th style="width: 8%;">Q. No.</th>
                    <th style="width: 6%;"></th>
                    <th style="width: 66%;">Questions</th>
                    <th style="width: 10%;">CO</th>
                    <th style="width: 10%;">BTL</th>
                </tr>
            </thead>
            <tbody>
                ${partB.map(group => `
                    <tr>
                        <td rowspan="3" class="part-b-qbox">${group.qNo}</td>
                        <td class="center">(a)</td>
                        <td class="question-text">${formatQuestionText(group.a.text)}</td>
                        <td rowspan="3" class="center">${group.a.co}</td>
                        <td rowspan="3" class="center">${group.a.btl}</td>
                    </tr>
                    <tr class="or-row">
                        <td colspan="2">Or</td>
                    </tr>
                    <tr>
                        <td class="center">(b)</td>
                        <td class="question-text">${formatQuestionText(group.b.text)}</td>
                    </tr>
                `).join('')}
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
                            <td rowspan="2" style="text-align: left; font-weight: bold; padding-left: 5px; vertical-align: middle;">${btls[bIdx]}</td>
                            <td style="font-weight: bold; font-size: 8pt; background-color: #fcfcfc;">Q. No.</td>
                            ${cos.map(co => `
                                <td>${summary[`${btlKey}_${co}_Q`].length > 0 ? summary[`${btlKey}_${co}_Q`].join(',') : ""}</td>
                            `).join('')}
                            <td></td> <!-- Total Marks cell in Q.No row is empty -->
                            <td rowspan="2" style="font-weight: bold; vertical-align: middle;">${percentage}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; font-size: 8pt; background-color: #fcfcfc;">Marks</td>
                            ${cos.map(co => `
                                <td>${summary[`${btlKey}_${co}_M`] > 0 ? summary[`${btlKey}_${co}_M`] : ""}</td>
                            `).join('')}
                            <td style="font-weight: bold; background-color: #fcfcfc;">${btlRowTotal > 0 ? btlRowTotal : ""}</td>
                        </tr>
                    `;
    }).join('')}
                <tr style="font-weight: bold; background-color: #f2f2f2;">
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
    </html>
    `;
};

app.post('/api/papers', async (req, res) => {
    try {
        console.log('--- REFINED PDF GENERATOR ACTIVE ---');
        const { header, partA, partB } = req.body;

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
                        ...partA.map(q => ({ ...q, part: 'A', marks: 2 })),
                        ...partB.flatMap(q => [
                            { ...q.a, qNo: q.qNo + 'a', part: 'B', marks: 16 },
                            { ...q.b, qNo: q.qNo + 'b', part: 'B', marks: 16 }
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
                summary[`${q.btl}_${q.co}_Q`].push(q.qNo);
                summary[`${q.btl}_${q.co}_M`] += marks;
                summary[`${q.co}_TOTAL`] += marks;
            }
        };

        partA.forEach((q, i) => processQuestion({ ...q, qNo: (i + 1).toString() }, 2));
        partB.forEach(g => {
            processQuestion({ ...g.a, qNo: g.qNo }, 16);
        });

        let correctGrandTotal = 0;
        btlKeys.forEach(btl => {
            cos.forEach(co => {
                correctGrandTotal += summary[`${btl}_${co}_M`];
            });
        });

        const paperData = {
            ...paper,
            commonTo: header.commonTo,
            permittingNotes: header.permittingNotes
        };
        const htmlContent = generateHTML(paperData, partA, partB, summary, correctGrandTotal, btlKeys, cos, btls);

        const pdfFileName = `paper_${paper.id}.pdf`;
        const pdfFilePath = path.join(generatedDir, pdfFileName);

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

        await prisma.cIAPaper.update({
            where: { id: paper.id },
            data: { filePath: pdfFileName }
        });

        res.json({ id: paper.id, pdfUrl: `/generated/${pdfFileName}` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/papers', async (req, res) => {
    const papers = await prisma.cIAPaper.findMany({
        orderBy: { createdAt: 'desc' }
    });
    res.json(papers);
});

app.listen(PORT, '172.27.53.175', () => {
    console.log(`Server running on http://172.27.53.175:${PORT}`);
    console.log('Refined Header Logic Loaded: Bold Address, DD-MM-YYYY Date, Roman numerals');
});
