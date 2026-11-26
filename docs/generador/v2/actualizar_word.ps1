# Abre el documento con Word, calcula la tabla de contenido y los numeros de pagina de las listas, lo guarda
# y, si se indica -Pdf, lo exporta a PDF. Requiere Microsoft Word.
#   powershell -File v2/actualizar_word.ps1 [-Pdf ruta.pdf]
param(
  [string]$Documento = (Join-Path $PSScriptRoot '..\..\documento\Proyecto_de_Grado_Corregido.docx'),
  [string]$Pdf = ''
)
$ErrorActionPreference = 'Stop'
$ruta = (Resolve-Path $Documento).Path
$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($ruta, $false, $false)
  $doc.Repaginate()
  foreach ($indice in $doc.TablesOfContents) { $indice.Update() }
  [void]$doc.Fields.Update()
  $doc.Repaginate()
  foreach ($indice in $doc.TablesOfContents) { $indice.UpdatePageNumbers() }
  $doc.Save()
  if ($Pdf) { $doc.ExportAsFixedFormat($Pdf, 17) }
  Write-Output ("Paginas: " + $doc.ComputeStatistics(2))
  $doc.Close($false)
} finally {
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
