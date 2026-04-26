import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

// Table name for visit tracking
const VISITS_TABLE = 'site_visits'

export async function GET() {
  try {
    const supabase = getSupabaseClient()
    
    // Get current visit count
    const { data, error } = await supabase
      .from(VISITS_TABLE)
      .select('count')
      .eq('id', 1)
      .single()
    
    if (error) {
      // If table doesn't exist or no row, create it
      const { error: insertError } = await supabase
        .from(VISITS_TABLE)
        .insert({ id: 1, count: 0 })
      
      if (insertError && insertError.code !== '42P01') {
        // Error other than table not found
        console.error('Visit counter error:', insertError)
        return NextResponse.json({ count: 0 }, { status: 500 })
      }
      
      return NextResponse.json({ count: 0 })
    }
    
    return NextResponse.json({ count: data?.count || 0 })
  } catch (error) {
    console.error('Visit counter error:', error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = getSupabaseClient()
    
    // Increment visit count
    const { data, error } = await supabase
      .from(VISITS_TABLE)
      .select('count')
      .eq('id', 1)
      .single()
    
    if (error) {
      // Create row if it doesn't exist
      const { error: insertError } = await supabase
        .from(VISITS_TABLE)
        .insert({ id: 1, count: 1 })
      
      if (insertError) {
        console.error('Visit counter error:', insertError)
        return NextResponse.json({ count: 0 }, { status: 500 })
      }
      
      return NextResponse.json({ count: 1 })
    }
    
    const newCount = (data?.count || 0) + 1
    
    const { error: updateError } = await supabase
      .from(VISITS_TABLE)
      .update({ count: newCount })
      .eq('id', 1)
    
    if (updateError) {
      console.error('Visit counter error:', updateError)
      return NextResponse.json({ count: data?.count || 0 }, { status: 500 })
    }
    
    return NextResponse.json({ count: newCount })
  } catch (error) {
    console.error('Visit counter error:', error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}
