import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Icon from '../components/common/Icon.tsx'
import { fileIcon, fileStyle } from './file-icons.ts'

describe('fileIcon', () => {
  it('maps extensions and special names to type icons', () => {
    expect(fileIcon('main.ts')).toBe('fileCode')
    expect(fileIcon('src/app/App.tsx')).toBe('fileCode')
    expect(fileIcon('package.json')).toBe('fileJson')
    expect(fileIcon('config/app.yaml')).toBe('fileCog')
    expect(fileIcon('.env.local')).toBe('fileCog')
    expect(fileIcon('assets/logo.svg')).toBe('fileImage')
    expect(fileIcon('demo.mp4')).toBe('fileVideo')
    expect(fileIcon('data/table.csv')).toBe('fileSpreadsheet')
    expect(fileIcon('backup.tar.gz')).toBe('fileArchive')
    expect(fileIcon('notes.md')).toBe('fileText')
    expect(fileIcon('Dockerfile')).toBe('fileCode')
    expect(fileIcon('.gitignore')).toBe('gitBranch')
  })

  it('tints icons by type from the semantic palette', () => {
    expect(fileStyle('main.ts').className).toBe('text-link')
    expect(fileStyle('package.json').className).toBe('text-warn')
    expect(fileStyle('backup.zip').className).toBe('text-warn')
    expect(fileStyle('.env')).toMatchObject({ name: 'fileCog', className: 'text-fg-muted' })
    expect(fileStyle('assets/logo.svg').className).toBe('text-ok')
    expect(fileStyle('data/table.csv').className).toBe('text-ok')
    expect(fileStyle('demo.mp4').className).toBe('text-bad')
    expect(fileStyle('.gitignore').className).toBe('text-fg-muted')
    expect(fileStyle('notes.md').className).toBe('text-fg-faint')
  })

  it('renders every file-type icon with real path content', () => {
    const names = ['fileCode', 'fileJson', 'fileCog', 'fileImage', 'fileAudio', 'fileVideo', 'fileArchive', 'fileSpreadsheet'] as const
    for (const name of names) {
      const html = renderToStaticMarkup(<Icon name={name} size={14} />)
      expect(html, name).toContain('<path')
    }
  })
})
