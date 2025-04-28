// report-exporters.js
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

/**
 * Generates a report in PDF format
 * @param {Object} options - Configuration and data for the report
 * @param {String} options.title - Report title
 * @param {String} options.companyName - Company name
 * @param {Array} options.data - Array of objects to display in the report
 * @param {Array} options.columns - Column definitions [{header, key, width}]
 * @param {Object} options.parameters - Report parameters to display (name-value pairs)
 * @param {Object} options.summary - Summary data to display (name-value pairs)
 * @param {String} options.currency - Currency code for formatting (default: USD)
 * @param {Stream} outputStream - Output stream where the PDF will be written
 */
export const generatePdfReport = async (options, outputStream) => {
    const { 
        title = 'Report',
        subtitle = null,
        companyName = 'Company',
        data = [],
        columns = [],
        parameters = {},
        summary = {},
        currency = 'USD',
        locale = 'en-US'
    } = options;
    
    const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        bufferPages: true,
        info: {
            Title: title,
            Author: companyName,
            Subject: title,
            Keywords: 'report, pdf',
            Creator: `${companyName} System`,
            Producer: 'PDFKit'
        }
    });
    
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat(locale, { 
            style: 'currency', 
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    doc.pipe(outputStream);

    try {
        const styles = {
            primary: '#336699',
            secondary: '#f5f5f5',
            textColor: '#333333',
            headerTextColor: '#ffffff',
            borderColor: '#cccccc'
        };
        
        const now = new Date();

        // Header
        doc.rect(50, 50, doc.page.width - 100, 80)
           .fillAndStroke(styles.primary, styles.primary);
        
        doc.fillColor(styles.headerTextColor)
           .font('Helvetica-Bold')
           .fontSize(24)
           .text(companyName, 70, 70)
           .fontSize(16)
           .text(title, 70, 100);
        
        if (subtitle) {
            doc.fontSize(12).text(subtitle, 70, 120);
        }
        
        doc.font('Helvetica')
           .fontSize(10)
           .text(`Generated: ${now.toLocaleDateString(locale)} ${now.toLocaleTimeString(locale)}`, 
                 70, subtitle ? 140 : 120, { align: 'left' });
        
        // Parameters section (if any)
        if (Object.keys(parameters).length > 0) {
            const paramsTop = subtitle ? 170 : 150;
            
            doc.rect(50, paramsTop, doc.page.width - 100, 20 + (Object.keys(parameters).length * 15))
               .fillAndStroke(styles.secondary, styles.borderColor);
            
            doc.fillColor(styles.textColor)
               .fontSize(12)
               .font('Helvetica-Bold')
               .text('Report Parameters:', 70, paramsTop + 10);
            
            doc.font('Helvetica').fontSize(10);
            let infoY = paramsTop + 30;
            
            // Display each parameter
            Object.entries(parameters).forEach(([key, value]) => {
                doc.text(`${key}: ${value}`, 70, infoY);
                infoY += 15;
            });
        }
        
        // Summary section (if any)
        const summaryTop = (subtitle ? 170 : 150) + 
                          (Object.keys(parameters).length > 0 ? 40 + (Object.keys(parameters).length * 15) : 0);
        
        if (Object.keys(summary).length > 0) {
            doc.rect(50, summaryTop, doc.page.width - 100, 20 + (Object.keys(summary).length * 15))
               .fillAndStroke('#e6f7ff', styles.borderColor);
            
            doc.fillColor(styles.textColor)
               .fontSize(14)
               .font('Helvetica-Bold')
               .text('Summary', 70, summaryTop + 10);
            
            doc.font('Helvetica').fontSize(10);
            let summaryY = summaryTop + 30;
            
            // Display each summary item
            Object.entries(summary).forEach(([key, value]) => {
                let displayValue = value;
                
                // Format currency values if they are numbers
                if (typeof value === 'number' && key.toLowerCase().includes('total')) {
                    displayValue = formatCurrency(value);
                }
                
                doc.text(`${key}: ${displayValue}`, 70, summaryY);
                summaryY += 15;
            });
        }
        
        // Data table
        if (data.length > 0 && columns.length > 0) {
            const tableTop = summaryTop + 
                            (Object.keys(summary).length > 0 ? 40 + (Object.keys(summary).length * 15) : 0);
            
            const tableHeaders = columns.map(col => col.header || col.key);
            const colWidths = columns.map(col => col.width || 100);
            const colKeys = columns.map(col => col.key);
            
            // Calculate total table width and adjust column widths if needed
            const totalTableWidth = doc.page.width - 100;
            const specifiedWidth = colWidths.reduce((sum, width) => sum + width, 0);
            
            if (specifiedWidth < totalTableWidth) {
                const ratio = totalTableWidth / specifiedWidth;
                colWidths.forEach((width, i) => { colWidths[i] = width * ratio; });
            }
            
            // Draw table header
            doc.rect(50, tableTop, doc.page.width - 100, 20)
               .fillAndStroke(styles.primary, styles.primary);
            
            let currentX = 50;
            tableHeaders.forEach((header, i) => {
                doc.font('Helvetica-Bold')
                   .fontSize(10)
                   .fillColor(styles.headerTextColor)
                   .text(header, currentX + 5, tableTop + 6, 
                        { width: colWidths[i], align: i === columns.length - 1 && 
                          columns[i].type === 'number' ? 'right' : 'left' });
                currentX += colWidths[i];
            });
            
            // Draw table rows
            let y = tableTop + 20;
            
            for (let i = 0; i < data.length; i++) {
                const item = data[i];
                
                // New page if needed
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                    
                    // Draw header on new page
                    currentX = 50;
                    doc.rect(50, y, doc.page.width - 100, 20)
                       .fillAndStroke(styles.primary, styles.primary);
                       
                    tableHeaders.forEach((header, i) => {
                        doc.font('Helvetica-Bold')
                           .fontSize(10)
                           .fillColor(styles.headerTextColor)
                           .text(header, currentX + 5, y + 6, 
                                { width: colWidths[i], align: i === columns.length - 1 && 
                                  columns[i].type === 'number' ? 'right' : 'left' });
                        currentX += colWidths[i];
                    });
                    
                    y += 20;
                }
                
                // Alternating background color
                doc.rect(50, y, doc.page.width - 100, 20)
                   .fillAndStroke(i % 2 === 0 ? '#f9f9f9' : '#ffffff', styles.borderColor);
                
                // Row data
                doc.font('Helvetica').fontSize(9).fillColor(styles.textColor);
                
                currentX = 50;
                
                // Display each cell in the row
                colKeys.forEach((key, index) => {
                    const column = columns[index];
                    let cellValue = item[key];
                    
                    // Format the value based on column type
                    if (column.type === 'date' && cellValue) {
                        cellValue = new Date(cellValue).toLocaleDateString(locale);
                    } else if (column.type === 'currency' && typeof cellValue === 'number') {
                        cellValue = formatCurrency(cellValue);
                    } else if (cellValue === null || cellValue === undefined) {
                        cellValue = 'N/A';
                    }
                    
                    // Determine text alignment
                    const align = column.type === 'number' || column.type === 'currency' ? 'right' : 'left';
                    
                    doc.text(String(cellValue), currentX + 5, y + 6, 
                             { width: colWidths[index], align });
                    
                    currentX += colWidths[index];
                });
                
                y += 20;
            }
        }
        
        // Footer
        const addFooter = (doc) => {
            const pageCount = doc.bufferedPageRange().count;
            
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                
                // Page number
                doc.font('Helvetica').fontSize(8).fillColor('#999999')
                   .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 50,
                         { align: 'center', width: doc.page.width - 100 });
                
                // Footer line
                doc.moveTo(50, doc.page.height - 60)
                   .lineTo(doc.page.width - 50, doc.page.height - 60)
                   .stroke(styles.borderColor);
                
                // Footer text
                doc.font('Helvetica').fontSize(8).fillColor('#666666')
                   .text(`${companyName} - ${title}`, 50, doc.page.height - 40,
                         { align: 'center', width: doc.page.width - 100 });
            }
        };
        
        // Add footer
        addFooter(doc);
        
        // Finalize PDF
        doc.end();
        
    } catch (contentError) {
        console.error("Error generating PDF content:", contentError);
        throw contentError;
    }
};

/**
 * Generates a report in Excel format
 * @param {Object} options - Configuration and data for the report
 * @param {String} options.title - Report title
 * @param {String} options.companyName - Company name
 * @param {Array} options.data - Array of objects to display in the report
 * @param {Array} options.columns - Column definitions [{header, key, width, type}]
 * @param {Object} options.parameters - Report parameters to display (name-value pairs)
 * @param {Object} options.summary - Summary data to display (name-value pairs)
 * @param {String} options.currency - Currency code for formatting (default: USD)
 * @param {Stream} outputStream - Output stream where the Excel will be written
 */
export const generateExcelReport = async (options, outputStream) => {
    const { 
        title = 'Report',
        subtitle = null,
        companyName = 'Company',
        data = [],
        columns = [],
        parameters = {},
        summary = {},
        currency = 'USD',
        locale = 'en-US',
        worksheetName = null
    } = options;
    
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = `${companyName} System`;
        workbook.created = new Date();
        workbook.modified = new Date();
        workbook.lastPrinted = new Date();
        
        const worksheet = workbook.addWorksheet(worksheetName || title, {
            pageSetup: {
                paperSize: 9, // A4
                orientation: 'portrait',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 0,
                margins: {
                    left: 0.7, right: 0.7,
                    top: 0.75, bottom: 0.75,
                    header: 0.3, footer: 0.3
                }
            }
        });
        
        // Style definitions
        const styles = {
            titleStyle: {
                font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF336699' } },
                alignment: { horizontal: 'center', vertical: 'middle' }
            },
            subtitleStyle: {
                font: { bold: true, size: 12, color: { argb: 'FF333333' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
                alignment: { horizontal: 'left', vertical: 'middle' },
                border: {
                    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
                }
            },
            headerStyle: {
                font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF336699' } },
                alignment: { horizontal: 'center', vertical: 'middle' },
                border: {
                    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
                }
            },
            rowEvenStyle: {
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
                border: {
                    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
                }
            },
            rowOddStyle: {
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } },
                border: {
                    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
                }
            },
            totalStyle: {
                font: { bold: true, size: 11 },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F7FF' } },
                alignment: { horizontal: 'right', vertical: 'middle' },
                border: {
                    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
                }
            }
        };
        
        // Column definitions
        if (columns.length > 0) {
            worksheet.columns = columns.map(col => ({
                header: col.header || col.key,
                key: col.key,
                width: col.width || 15
            }));
        } else {
            // Default columns based on first data item
            if (data.length > 0) {
                worksheet.columns = Object.keys(data[0]).map(key => ({
                    header: key.charAt(0).toUpperCase() + key.slice(1),
                    key: key,
                    width: 15
                }));
            }
        }
        
        // Get column count for merging
        const columnCount = worksheet.columns.length;
        const mergeCols = `A1:${String.fromCharCode(64 + columnCount)}2`;
        
        // Report title
        worksheet.mergeCells(mergeCols);
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `${title} - ${companyName}`;
        titleCell.style = styles.titleStyle;
        worksheet.getRow(1).height = 30;
        
        // Report information
        // Current date
        const now = new Date();
        const formattedDateTime = now.toLocaleString(locale);
        
        let currentRow = 3;
        
        // Parameters (if any)
        if (Object.keys(parameters).length > 0) {
            Object.entries(parameters).forEach(([key, value]) => {
                worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + columnCount)}${currentRow}`);
                const paramCell = worksheet.getCell(`A${currentRow}`);
                paramCell.value = `${key}: ${value}`;
                paramCell.style = {
                    font: { size: 10 },
                    alignment: { horizontal: 'left', vertical: 'middle' }
                };
                currentRow++;
            });
        }
        
        // Generation date
        worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + columnCount)}${currentRow}`);
        const dateCell = worksheet.getCell(`A${currentRow}`);
        dateCell.value = `Generated: ${formattedDateTime}`;
        dateCell.style = {
            font: { size: 10, italic: true },
            alignment: { horizontal: 'left', vertical: 'middle' }
        };
        currentRow += 2;
        
        // Summary (if any)
        if (Object.keys(summary).length > 0) {
            worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + columnCount)}${currentRow}`);
            const summaryTitle = worksheet.getCell(`A${currentRow}`);
            summaryTitle.value = 'Summary';
            summaryTitle.style = styles.subtitleStyle;
            currentRow++;
            
            Object.entries(summary).forEach(([key, value]) => {
                worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + columnCount - 1)}${currentRow}`);
                worksheet.getCell(`A${currentRow}`).value = `${key}:`;
                worksheet.getCell(`A${currentRow}`).style = {
                    font: { bold: true },
                    alignment: { horizontal: 'right' }
                };
                
                const valueCell = worksheet.getCell(`${String.fromCharCode(64 + columnCount)}${currentRow}`);
                valueCell.value = value;
                
                // Format currency if applicable
                if (typeof value === 'number' && key.toLowerCase().includes('total')) {
                    valueCell.numFmt = `"${currency}" #,##0_-;[Red]-"${currency}" #,##0_-`;
                }
                
                currentRow++;
            });
            
            currentRow += 2;
        }
        
        // Data table
        if (data.length > 0) {
            const tableStartRow = currentRow;
            
            // Configure header styles
            const headerRow = worksheet.getRow(tableStartRow);
            headerRow.height = 20;
            headerRow.eachCell((cell) => {
                cell.style = styles.headerStyle;
            });
            
            // Add data rows
            let rowNumber = tableStartRow + 1;
            data.forEach((item, index) => {
                const rowData = {};
                
                // Prepare row data 
                columns.forEach(col => {
                    let value = item[col.key];
                    
                    // Handle special column types
                    if (col.type === 'date' && value) {
                        value = new Date(value);
                    }
                    
                    rowData[col.key] = value;
                });
                
                const row = worksheet.addRow(rowData);
                
                // Apply alternating row styles
                const rowStyle = index % 2 === 0 ? styles.rowEvenStyle : styles.rowOddStyle;
                row.eachCell((cell) => {
                    cell.style = { 
                        ...cell.style,
                        ...rowStyle
                    };
                });
                
                rowNumber++;
            });
            
            // Apply column formats
            columns.forEach(col => {
                if (col.type === 'date') {
                    worksheet.getColumn(col.key).numFmt = locale === 'en-US' ? 'mm/dd/yyyy' : 'dd/mm/yyyy';
                } else if (col.type === 'currency') {
                    worksheet.getColumn(col.key).numFmt = `"${currency}" #,##0_-;[Red]-"${currency}" #,##0_-`;
                    worksheet.getColumn(col.key).alignment = { horizontal: 'right' };
                } else if (col.type === 'number') {
                    worksheet.getColumn(col.key).alignment = { horizontal: 'right' };
                }
            });
            
            // Add totals row if summary includes a total
            const totalValue = summary['Total'] || summary['Total Amount'];
            if (totalValue !== undefined) {
                const currencyCol = columns.find(col => col.type === 'currency');
                if (currencyCol) {
                    const totalRow = [];
                    columns.forEach((col, index) => {
                        totalRow[index] = index === 0 ? 'Total' : 
                            (col.key === currencyCol.key ? totalValue : '');
                    });
                    
                    const totalsRow = worksheet.addRow(totalRow);
                    totalsRow.eachCell((cell) => {
                        cell.style = styles.totalStyle;
                    });
                    
                    worksheet.getCell(`${String.fromCharCode(65 + columns.findIndex(c => c.key === currencyCol.key))}${rowNumber}`)
                        .numFmt = `"${currency}" #,##0_-;[Red]-"${currency}" #,##0_-`;
                }
            }
            
            // Footer
            const footerRow = rowNumber + 2;
            worksheet.mergeCells(`A${footerRow}:${String.fromCharCode(64 + columnCount)}${footerRow}`);
            const footerCell = worksheet.getCell(`A${footerRow}`);
            footerCell.value = `${companyName} - ${title}`;
            footerCell.style = {
                font: { size: 8, italic: true, color: { argb: 'FF666666' } },
                alignment: { horizontal: 'center' }
            };
        }
        
        // Write to stream
        await workbook.xlsx.write(outputStream);
        
    } catch (excelError) {
        console.error("Error generating Excel file:", excelError);
        throw excelError;
    }
};