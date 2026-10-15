import { describe, expect, test } from 'vitest'
import {
  analyzeModule,
  cloneModuleAst,
  generateModule,
  prependStatements,
} from '../src'

function parseProgram(code: string) {
  return cloneModuleAst(analyzeModule({ code })).program
}

describe('prependStatements', () => {
  test.each(['', `'use client'; 'use strict';`])(
    'inserts after the complete prologue in a module with no other statements: %j',
    (code) => {
      const program = parseProgram(code)
      prependStatements(program, ...parseProgram(`import './setup';`).body)

      expect(generateModule(program).code).toEqual(
        generateModule(parseProgram(`${code} import './setup';`)).code,
      )
    },
  )

  test('keeps each batch in order and prepends later batches after the directives', () => {
    const program = parseProgram(`'use client'; 'use strict'; original();`)
    prependStatements(program, ...parseProgram('first(); second();').body)
    prependStatements(program, ...parseProgram('third(); fourth();').body)

    expect(generateModule(program).code).toEqual(
      generateModule(
        parseProgram(`'use client'; 'use strict';
third(); fourth(); first(); second(); original();`),
      ).code,
    )
  })

  test('leaves string statements outside the prologue in their original position', () => {
    const program = parseProgram(`'use client'; original(); 'use server';`)
    prependStatements(program, ...parseProgram(`import './setup';`).body)

    expect(generateModule(program).code).toEqual(
      generateModule(
        parseProgram(
          `'use client'; import './setup'; original(); 'use server';`,
        ),
      ).code,
    )
  })
})
