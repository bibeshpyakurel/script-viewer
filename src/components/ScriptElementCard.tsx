import { attr, childElements, text } from '../script/selectors';
import type { Field, PageModel, ScriptElementModel } from '../script/selectors';
import { UnrecognizedFields } from './UnrecognizedFields';

/**
 * One script element, rendered the way a reviewer reads it.
 *
 * The layout follows what an operator actually does with the element: what they
 * say, what they type, what constrains it, and where the call goes next. Each
 * block renders only when the export supplies it, so a sparse element stays
 * compact instead of showing a column of "none" rows.
 *
 * Everything this component does not name explicitly is rendered by
 * {@link UnrecognizedFields} at the bottom. See `script/selectors.ts` for why
 * that matters.
 */
export function ScriptElementCard({
  element,
  elementsById,
  pagesById,
}: {
  element: ScriptElementModel;
  elementsById: Map<string, ScriptElementModel>;
  pagesById: Map<string, PageModel>;
}) {
  const kind = element.xsiType ?? element.nodeType ?? 'Element';
  const required = element.requirements.some(
    (f) => f.name === 'Required' && f.value === 'true',
  );

  return (
    <article className="el" id={element.id}>
      <header className="el-head">
        <span className={`el-kind el-kind-${kindSlug(kind)}`}>{kind}</span>
        <h4 className="el-name">{element.name ?? element.id ?? 'Untitled'}</h4>
        {required && <span className="el-required">required</span>}
        {element.tag && <code className="el-tag">{element.tag}</code>}
        {element.id && <code className="el-id">{element.id}</code>}
      </header>

      {element.description && <p className="el-desc">{element.description}</p>}

      {/* What the operator says. The spoken line is the point of the element,
          so it gets the most visual weight on the card. */}
      {element.prompt.length > 0 && (
        <div className="prompt">
          {element.prompt.map((f) => (
            <div className={`prompt-line prompt-${slug(f.name)}`} key={f.name}>
              <span className="prompt-label">{humanize(f.name)}</span>
              <span className="prompt-text">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {element.requirements.length > 0 && (
        <FieldChips label="Requirements" fields={element.requirements} />
      )}

      {element.options.length > 0 && (
        <section className="el-block">
          <h5 className="el-block-title">
            Options <span className="el-count">{element.options.length}</span>
          </h5>
          <ol className="options">
            {element.options.map((o, i) => (
              <li className="option" key={i}>
                <span className="option-label">{o.label}</span>
                {o.value !== undefined && o.value !== o.label && (
                  <code className="option-value">{o.value}</code>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {element.conditions.length > 0 && (
        <section className="el-block">
          <h5 className="el-block-title">Conditional actions</h5>
          {element.conditions.map((when, i) => (
            <div className="cond" key={i}>
              <span className="cond-when">
                When{' '}
                <code>
                  {elementsById.get(attr(when, 'fieldId') ?? '')?.name ??
                    attr(when, 'fieldId')}
                </code>{' '}
                {humanize(attr(when, 'operator') ?? '')}{' '}
                <code>{attr(when, 'value')}</code>
              </span>
              {childElements(when).map((action, j) => (
                <div className="cond-then" key={j}>
                  <span className="cond-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="cond-type">{attr(action, 'type')}</span>
                  <span className="cond-text">{text(action)}</span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {element.templateFieldIds.length > 0 && (
        <section className="el-block">
          <h5 className="el-block-title">
            Reads back{' '}
            <span className="el-count">{element.templateFieldIds.length}</span>
          </h5>
          <ul className="refs">
            {element.templateFieldIds.map((id) => {
              const target = elementsById.get(id);
              return (
                <li className="ref" key={id}>
                  {target ? (
                    // Resolved to the field's real name, not a bare id.
                    <a className="ref-link" href={`#${id}`}>
                      {target.name ?? id}
                    </a>
                  ) : (
                    <span className="ref-missing">{id}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {element.calcs.length > 0 && (
        <section className="el-block">
          <h5 className="el-block-title">Calculation</h5>
          {element.calcs.map((expr, i) => (
            <div className="calc" key={i}>
              <code className="calc-expr">{text(expr)}</code>
              {expr.attributes.map((a) => (
                <span className="calc-attr" key={a.name}>
                  {a.name}: {a.value}
                </span>
              ))}
            </div>
          ))}
        </section>
      )}

      {element.display.length > 0 && (
        <FieldChips label="Display" fields={element.display} />
      )}

      {element.modes.length > 0 && (
        <section className="el-block">
          <h5 className="el-block-title">
            Modes <span className="el-count">{element.modes.length}</span>
          </h5>
          <div className="modes">
            {element.modes.map((mode, i) => (
              <div className="mode" key={i}>
                <span className="mode-name">{mode.name ?? 'Unnamed'}</span>
                {mode.fields.length > 0 ? (
                  mode.fields.map((f) => (
                    <span className="mode-hint" key={f.name}>
                      {f.value}
                    </span>
                  ))
                ) : (
                  // Says "no overrides" rather than rendering nothing, so an
                  // empty <XmlSerializiationData /> does not look dropped.
                  <span className="mode-empty">no overrides</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {(element.navType || element.navScreen) && (
        <div className="nav">
          <span className="nav-arrow" aria-hidden="true">
            ↳
          </span>
          <span className="nav-label">{element.navType ?? 'Next'}</span>
          {element.navScreen && (
            <a className="nav-target" href={`#${element.navScreen}`}>
              {pagesById.get(element.navScreen)?.name ?? element.navScreen}
            </a>
          )}
        </div>
      )}

      <UnrecognizedFields
        nodes={element.rest}
        attributes={element.restAttributes}
        context="this element"
      />
    </article>
  );
}

/** A labelled row of name/value chips, used for requirements and display. */
function FieldChips({ label, fields }: { label: string; fields: Field[] }) {
  return (
    <section className="el-block">
      <h5 className="el-block-title">{label}</h5>
      <div className="chips">
        {fields.map((f) => (
          <span
            className={`chip${f.value === 'true' ? ' chip-on' : ''}${
              f.value === 'false' ? ' chip-off' : ''
            }`}
            key={f.name}
          >
            <span className="chip-name">{humanize(f.name)}</span>
            {/* Booleans read as the chip's state; other values are shown. */}
            {f.value !== 'true' && f.value !== '' && (
              <span className="chip-value">{f.value}</span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

/** `AfterHoursText` -> `After hours text`. Purely cosmetic. */
function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Turn any name into a CSS-class-safe suffix, so a field can be styled by
 *  name (`prompt-spokentext`) without assuming which names exist. */
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Class suffix for the kind badge, so styling never depends on an exact name. */
function kindSlug(kind: string): string {
  const lower = kind.toLowerCase();
  if (lower.includes('display')) return 'display';
  if (lower.includes('select')) return 'select';
  if (lower.includes('input')) return 'input';
  return 'other';
}
