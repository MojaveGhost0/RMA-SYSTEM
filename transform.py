import re

with open("index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Add Supabase and ChartJS to <head>
head_addition = """    <!-- Supabase -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
"""
html = html.replace('    <title>Garantías - ELECTRONICA.COM.VE</title>', '    <title>Garantías - ELECTRONICA.COM.VE</title>\n' + head_addition)

# Add nav-reports to Sidebar
nav_addition = """
                <a href="#" onclick="switchView('reports')" id="nav-reports" class="nav-link flex items-center px-4 py-3 text-slate-500 hover:bg-slate-50 hover:text-primary rounded-xl font-medium transition-all duration-200 group">
                    <i class="fa-solid fa-chart-line w-6 text-lg group-hover:scale-110 transition-transform"></i>
                    <span>Reportes e Históricos</span>
                </a>"""
html = html.replace('<span>Gestión de Garantías</span>\n                </a>', '<span>Gestión de Garantías</span>\n                </a>' + nav_addition)

# Add view-reports to main content
reports_view = """

            <!-- Reports View -->
            <div id="view-reports" class="hide animate-fade-in space-y-8">
                <!-- Top Filters -->
                <div class="bg-white p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col md:flex-row gap-4 items-end justify-between">
                    <div class="w-full md:w-1/3 relative group">
                        <label class="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Buscar por Referencia</label>
                        <i class="fa-solid fa-search absolute left-4 top-9 text-slate-400 group-focus-within:text-primary transition-colors"></i>
                        <input type="text" id="reportSearchReference" placeholder="Ej. REF-001..." 
                            class="pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl w-full focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary text-sm transition-all"
                            onkeyup="handleReportSearch(event)">
                    </div>
                </div>

                <!-- Charts -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-white p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100">
                        <h3 class="font-bold text-slate-800 mb-4">Estado de Garantías</h3>
                        <canvas id="chartStatus" height="200"></canvas>
                    </div>
                    <div class="bg-white p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100">
                        <h3 class="font-bold text-slate-800 mb-4">Garantías por Producto (Top 5)</h3>
                        <canvas id="chartProducts" height="200"></canvas>
                    </div>
                </div>

                <!-- Historical List -->
                <div class="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden mt-8">
                    <div class="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <div>
                            <h3 class="font-bold text-lg text-slate-800">Histórico de Registros</h3>
                            <p class="text-xs text-slate-500 mt-1">Garantías encontradas por referencia</p>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-white text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                                    <th class="py-4 px-8 font-semibold">ID / Cliente</th>
                                    <th class="py-4 px-8 font-semibold">Producto / Ref</th>
                                    <th class="py-4 px-8 font-semibold">Estado</th>
                                    <th class="py-4 px-8 font-semibold">Recepción</th>
                                </tr>
                            </thead>
                            <tbody id="report-table-body" class="divide-y divide-slate-100 bg-white">
                                <!-- Dynamic rows -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>"""
html = html.replace('            <!-- Dashboard View -->', reports_view + '\n            <!-- Dashboard View -->')

# Add delete button to modal
delete_btn = """
                    <button type="button" onclick="confirmDeleteRMA()" class="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white shadow-sm transition-colors border border-red-100" title="Eliminar Garantía">
                        <i class="fa-solid fa-trash"></i>
                    </button>"""
html = html.replace('class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-primary', delete_btn + '\n                    <button type="button" onclick="exportPDF()" class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-primary')

# Extract JS to app.js
script_match = re.search(r'<!-- Script Application Logic -->\s*<script>(.*?)</script>', html, re.DOTALL)
if script_match:
    js_code = script_match.group(1)
    with open("app.js", "w", encoding="utf-8") as f:
        f.write(js_code)
    html = html.replace(script_match.group(0), '<!-- Script Application Logic -->\n    <script src="app.js"></script>')

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)
print("Transformation successful")
