import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// Simple file-based visit counter that doesn't require database
const VISIT_COUNT_FILE = 'public/visit-count.json'

// Helper to read visit count from file
async function readVisitCount(): Promise<number> {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const filePath = path.join(process.cwd(), VISIT_COUNT_FILE)
    const data = await fs.readFile(filePath, 'utf-8')
    const json = JSON.parse(data)
    return json.count || 0
  } catch (error) {
    // File doesn't exist or error reading, return 0
    return 0
  }
}

// Helper to write visit count to file
async function writeVisitCount(count: number): Promise<void> {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const filePath = path.join(process.cwd(), VISIT_COUNT_FILE)
    await fs.writeFile(filePath, JSON.stringify({ count }), 'utf-8')
  } catch (error) {
    console.error('Failed to write visit count:', error)
  }
}

export async function GET() {
  try {
    const count = await readVisitCount()
    return NextResponse.json({ count })
  } catch (error) {
    console.error('Visit counter error:', error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}

export async function POST() {
  try {
    const currentCount = await readVisitCount()
    const newCount = currentCount + 1
    await writeVisitCount(newCount)
    revalidatePath('/')
    return NextResponse.json({ count: newCount })
  } catch (error) {
    console.error('Visit counter error:', error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}
