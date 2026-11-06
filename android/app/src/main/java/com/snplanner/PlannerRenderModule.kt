// Coded with Claude (https://claude.com/claude-code). No human wrote a line of this — review accordingly before relying on it.
package com.snplanner

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Typeface
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.FileOutputStream

/**
 * Renders a list of draw ops (see src/layout.js for the format) into a PNG
 * template page. Pure Android Canvas; no third-party deps.
 */
class PlannerRenderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "PlannerRender"

  private fun gray(v: Int): Int = Color.rgb(v, v, v)

  private fun num(m: ReadableMap, key: String, def: Double = 0.0): Float =
      if (m.hasKey(key) && !m.isNull(key)) m.getDouble(key).toFloat() else def.toFloat()

  private fun drawOps(canvas: Canvas, ops: ReadableArray) {
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.BUTT }
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    val text = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG)

    for (i in 0 until ops.size()) {
      val o = ops.getMap(i) ?: continue
      when (o.getString("op")) {
        "line" -> {
          stroke.color = gray(if (o.hasKey("gray")) o.getInt("gray") else 0)
          stroke.strokeWidth = num(o, "w", 2.0)
          stroke.pathEffect = if (o.hasKey("dash") && o.getBoolean("dash"))
              DashPathEffect(floatArrayOf(10f, 10f), 0f) else null
          canvas.drawLine(num(o, "x1"), num(o, "y1"), num(o, "x2"), num(o, "y2"), stroke)
          stroke.pathEffect = null
        }
        "rect" -> {
          val x = num(o, "x"); val y = num(o, "y"); val w = num(o, "w"); val h = num(o, "h")
          if (o.hasKey("fill") && !o.isNull("fill")) {
            fill.color = gray(o.getInt("fill"))
            canvas.drawRect(x, y, x + w, y + h, fill)
          }
          val lw = num(o, "lw", 0.0)
          if (lw > 0f) {
            stroke.color = Color.BLACK
            stroke.strokeWidth = lw
            canvas.drawRect(x, y, x + w, y + h, stroke)
          }
        }
        "text" -> {
          val bold = o.hasKey("bold") && o.getBoolean("bold")
          text.typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
          text.textSize = num(o, "size", 24.0)
          text.color = gray(if (o.hasKey("gray")) o.getInt("gray") else 0)
          text.textAlign = when (o.getString("align")) {
            "center" -> Paint.Align.CENTER
            "right" -> Paint.Align.RIGHT
            else -> Paint.Align.LEFT
          }
          // y is the top of the text box; convert to baseline.
          val baseline = num(o, "y") - text.fontMetrics.ascent
          canvas.drawText(o.getString("text") ?: "", num(o, "x"), baseline, text)
        }
        "circle" -> {
          stroke.color = Color.BLACK
          stroke.strokeWidth = num(o, "lw", 2.0)
          canvas.drawCircle(num(o, "cx"), num(o, "cy"), num(o, "r"), stroke)
        }
      }
    }
  }

  /** Renders one page. */
  @ReactMethod
  fun renderPng(ops: ReadableArray, width: Int, height: Int, outPath: String, promise: Promise) {
    try {
      val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      try {
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)
        drawOps(canvas, ops)
        val f = File(outPath)
        f.parentFile?.mkdirs()
        FileOutputStream(f).use { out ->
          if (!bmp.compress(Bitmap.CompressFormat.PNG, 100, out)) throw RuntimeException("PNG compress failed")
        }
      } finally {
        bmp.recycle()
      }
      promise.resolve(outPath)
    } catch (e: Throwable) {
      promise.reject("ERENDER", e.message ?: e.toString(), e)
    }
  }

  /** Small text-file helpers for the plugin's own registry file. */
  @ReactMethod
  fun readText(path: String, promise: Promise) {
    try {
      val f = File(path)
      promise.resolve(if (f.exists()) f.readText(Charsets.UTF_8) else null)
    } catch (e: Throwable) {
      promise.reject("EREAD", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun writeText(path: String, text: String, promise: Promise) {
    try {
      val f = File(path)
      f.parentFile?.mkdirs()
      f.writeText(text, Charsets.UTF_8)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("EWRITE", e.message ?: e.toString(), e)
    }
  }
}
